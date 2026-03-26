const { getDatabase } = require('./database');

function normalizeTitle(title) {
  if (!title) return '';
  return title.trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/sr\.?\s*/i, '')
    .replace(/jr\.?\s*/i, '')
    .replace(/\d+/g, '')
    .trim();
}

function sanitizeRoleName(str) {
  return str.replace(/[^a-zA-Z0-9\u00C0-\u024F -]/g, '').replace(/\s+/g, '-');
}

function jaccardSimilarity(setA, setB) {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function getUserGroupSets(db) {
  const rows = db.prepare(`
    SELECT user_name, group_name FROM effective_memberships
  `).all();

  const userGroups = {};
  for (const r of rows) {
    if (!userGroups[r.user_name]) userGroups[r.user_name] = new Set();
    userGroups[r.user_name].add(r.group_name);
  }
  return userGroups;
}

function clusterByFunction(db) {
  const users = db.prepare(`
    SELECT sam_account_name, title, department FROM users
    WHERE enabled = 1 AND title IS NOT NULL AND title != ''
  `).all();

  const titleClusters = {};
  for (const u of users) {
    const normalized = normalizeTitle(u.title);
    if (!normalized) continue;
    if (!titleClusters[normalized]) {
      titleClusters[normalized] = { originalTitle: u.title, users: [] };
    }
    titleClusters[normalized].users.push(u);
  }

  return titleClusters;
}

function clusterByDepartment(titleClusters) {
  const departmentClusters = {};

  for (const [titleKey, cluster] of Object.entries(titleClusters)) {
    const byDept = {};
    for (const u of cluster.users) {
      const dept = u.department || 'Onbekend';
      if (!byDept[dept]) byDept[dept] = [];
      byDept[dept].push(u);
    }
    departmentClusters[titleKey] = {
      originalTitle: cluster.originalTitle,
      totalUsers: cluster.users.length,
      departments: byDept,
    };
  }

  return departmentClusters;
}

function computeCommonGroups(userNames, userGroupSets) {
  if (userNames.length === 0) return new Set();

  let common = null;
  for (const name of userNames) {
    const groups = userGroupSets[name];
    if (!groups) continue;
    if (common === null) {
      common = new Set(groups);
    } else {
      for (const g of common) {
        if (!groups.has(g)) common.delete(g);
      }
    }
  }
  return common || new Set();
}

function generateRoles(db) {
  console.log('  Gebruikers clusteren op functie...');
  const titleClusters = clusterByFunction(db);
  console.log(`  ${Object.keys(titleClusters).length} unieke functies gevonden`);

  console.log('  Sub-clusteren op afdeling...');
  const deptClusters = clusterByDepartment(titleClusters);

  const userGroupSets = getUserGroupSets(db);

  // Clear existing proposals
  db.prepare('DELETE FROM proposed_role_users').run();
  db.prepare('DELETE FROM proposed_role_groups').run();
  db.prepare('DELETE FROM proposed_roles').run();

  const insertRole = db.prepare(`
    INSERT INTO proposed_roles (role_name, role_layer, function_title, department, description, source_pattern, user_count, group_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRoleGroup = db.prepare('INSERT OR IGNORE INTO proposed_role_groups (role_id, group_name) VALUES (?, ?)');
  const insertRoleUser = db.prepare('INSERT OR IGNORE INTO proposed_role_users (role_id, user_name, confidence, is_outlier) VALUES (?, ?, ?, ?)');

  const tx = db.transaction(() => {
    for (const [titleKey, cluster] of Object.entries(deptClusters)) {
      const allUserNames = [];
      for (const users of Object.values(cluster.departments)) {
        for (const u of users) allUserNames.push(u.sam_account_name);
      }

      // Layer 1: Base role (function-level)
      const baseGroups = computeCommonGroups(allUserNames, userGroupSets);
      if (cluster.totalUsers >= 2) {
        const roleName = `ROL-${sanitizeRoleName(cluster.originalTitle)}`;
        const info = insertRole.run(
          roleName, 'basis', cluster.originalTitle, null,
          `Basisrol voor functie: ${cluster.originalTitle} (${cluster.totalUsers} medewerkers)`,
          `Gemeenschappelijke groepen van alle ${cluster.originalTitle}`,
          cluster.totalUsers, baseGroups.size
        );
        const roleId = info.lastInsertRowid;

        for (const g of baseGroups) {
          insertRoleGroup.run(roleId, g);
        }
        for (const userName of allUserNames) {
          insertRoleUser.run(roleId, userName, 1.0, 0);
        }
      }

      // Layer 2: Department roles (function + department)
      for (const [dept, users] of Object.entries(cluster.departments)) {
        if (users.length < 2) continue;

        const deptUserNames = users.map(u => u.sam_account_name);
        const deptGroups = computeCommonGroups(deptUserNames, userGroupSets);

        // Only groups that are extra (not in base role)
        const extraGroups = new Set([...deptGroups].filter(g => !baseGroups.has(g)));

        if (extraGroups.size > 0) {
          const roleName = `ROL-${sanitizeRoleName(cluster.originalTitle)}-${sanitizeRoleName(dept)}`;
          const info = insertRole.run(
            roleName, 'afdeling', cluster.originalTitle, dept,
            `Afdelingsrol: ${cluster.originalTitle} op ${dept} (${users.length} medewerkers)`,
            `Extra groepen bovenop basisrol voor afdeling ${dept}`,
            users.length, extraGroups.size
          );
          const roleId = info.lastInsertRowid;

          for (const g of extraGroups) {
            insertRoleGroup.run(roleId, g);
          }
          for (const u of users) {
            insertRoleUser.run(roleId, u.sam_account_name, 1.0, 0);
          }
        }
      }
    }
  });

  tx();

  // Detect outliers: users whose groups don't match any cluster well
  detectOutliers(db, userGroupSets);
}

// --- Application Bundle Detection ---

const CO_OCCURRENCE_THRESHOLD = 0.80;
const MIN_BUNDLE_SIZE = 2;

function detectAppBundles(db) {
  console.log('\nApplicatiebundels detecteren...');

  db.prepare('DELETE FROM app_bundle_roles').run();
  db.prepare('DELETE FROM app_bundle_groups').run();
  db.prepare('DELETE FROM app_bundles').run();

  // Collect all groups assigned to roles
  const roleGroups = db.prepare(`
    SELECT pr.id as role_id, pr.role_name, prg.group_name
    FROM proposed_roles pr
    JOIN proposed_role_groups prg ON prg.role_id = pr.id
  `).all();

  // Build role-to-groups mapping
  const roleToGroups = {};
  for (const r of roleGroups) {
    if (!roleToGroups[r.role_id]) roleToGroups[r.role_id] = { name: r.role_name, groups: new Set() };
    roleToGroups[r.role_id].groups.add(r.group_name);
  }

  // Collect all unique groups across roles
  const allGroupNames = new Set();
  for (const r of Object.values(roleToGroups)) {
    for (const g of r.groups) allGroupNames.add(g);
  }

  if (allGroupNames.size === 0) {
    console.log('  Geen groepen in rollen gevonden, bundel-detectie overgeslagen.');
    return;
  }

  const roleIds = Object.keys(roleToGroups);
  const groupList = [...allGroupNames];
  console.log(`  ${groupList.length} unieke groepen in ${roleIds.length} rollen, co-occurrence berekenen...`);

  // Build inverted index: group -> Set of role IDs (much faster than scanning all roles per pair)
  const groupToRoles = {};
  for (const g of groupList) {
    groupToRoles[g] = new Set();
  }
  for (const rid of roleIds) {
    for (const g of roleToGroups[rid].groups) {
      groupToRoles[g].add(rid);
    }
  }

  // Skip groups that appear in very many roles (>50% of all roles) — these are generic groups, not app-specific
  const maxRoleCount = Math.max(roleIds.length * 0.5, 3);
  const candidateGroups = groupList.filter(g => groupToRoles[g].size >= 2 && groupToRoles[g].size <= maxRoleCount);
  console.log(`  ${candidateGroups.length} kandidaat-groepen (verschijnen in 2-${Math.round(maxRoleCount)} rollen)`);

  // For each pair of candidate groups, compute co-occurrence using set intersection (O(min(|A|,|B|)) per pair)
  const coOccurrence = {};
  for (let i = 0; i < candidateGroups.length; i++) {
    const a = candidateGroups[i];
    const rolesA = groupToRoles[a];
    for (let j = i + 1; j < candidateGroups.length; j++) {
      const b = candidateGroups[j];
      const rolesB = groupToRoles[b];
      // Count intersection and union via the smaller set
      let both = 0;
      const smaller = rolesA.size <= rolesB.size ? rolesA : rolesB;
      const larger = rolesA.size <= rolesB.size ? rolesB : rolesA;
      for (const rid of smaller) {
        if (larger.has(rid)) both++;
      }
      const either = rolesA.size + rolesB.size - both;
      if (either > 0 && both / either >= CO_OCCURRENCE_THRESHOLD) {
        coOccurrence[`${i}:${j}`] = { a, b, ratio: both / either };
      }
    }
  }

  // Cluster groups into bundles using union-find
  const parent = {};
  for (const g of groupList) parent[g] = g;

  function find(x) {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(x, y) {
    const px = find(x);
    const py = find(y);
    if (px !== py) parent[px] = py;
  }

  for (const { a, b } of Object.values(coOccurrence)) {
    union(a, b);
  }

  // Group by cluster root
  const clusters = {};
  for (const g of groupList) {
    const root = find(g);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(g);
  }

  // Filter: only bundles with MIN_BUNDLE_SIZE+ groups
  const bundles = Object.values(clusters).filter(c => c.length >= MIN_BUNDLE_SIZE);

  if (bundles.length === 0) {
    console.log('  Geen applicatiebundels gedetecteerd (te weinig co-occurrence).');
    return;
  }

  console.log(`  ${bundles.length} applicatiebundels gedetecteerd`);

  const insertBundle = db.prepare('INSERT INTO app_bundles (bundle_name, description, group_count) VALUES (?, ?, ?)');
  const insertBundleGroup = db.prepare('INSERT INTO app_bundle_groups (bundle_id, group_name) VALUES (?, ?)');
  const insertBundleRole = db.prepare('INSERT INTO app_bundle_roles (bundle_id, role_id) VALUES (?, ?)');

  const tx = db.transaction(() => {
    let bundleIndex = 0;
    for (const groups of bundles) {
      bundleIndex++;

      // Name the bundle based on common prefix or index
      const bundleName = deriveBundleName(groups, bundleIndex);
      const description = `Applicatiebundel: ${groups.length} groepen die in >${Math.round(CO_OCCURRENCE_THRESHOLD * 100)}% van de rollen samen voorkomen`;

      const info = insertBundle.run(bundleName, description, groups.length);
      const bundleId = info.lastInsertRowid;

      for (const g of groups) {
        insertBundleGroup.run(bundleId, g);
      }

      // Link bundle to roles that contain ALL groups in this bundle
      for (const rid of roleIds) {
        const roleGroupSet = roleToGroups[rid].groups;
        if (groups.every(g => roleGroupSet.has(g))) {
          insertBundleRole.run(bundleId, Number(rid));
        }
      }

      console.log(`  ${bundleName}: ${groups.slice(0, 5).join(', ')}${groups.length > 5 ? ` (+${groups.length - 5})` : ''}`);
    }
  });

  tx();
}

function deriveBundleName(groups, index) {
  // Try to find a common prefix among group names
  const prefixes = {};
  for (const g of groups) {
    const parts = g.split('-');
    if (parts.length >= 2) {
      const prefix = parts.slice(0, 2).join('-');
      prefixes[prefix] = (prefixes[prefix] || 0) + 1;
    }
  }

  // If >50% share a prefix, use it
  const sorted = Object.entries(prefixes).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0 && sorted[0][1] >= groups.length * 0.5) {
    return `APP-BUNDEL-${sanitizeRoleName(sorted[0][0])}`;
  }

  return `APP-BUNDEL-${String(index).padStart(2, '0')}`;
}

// --- AGDLP Analysis & Proposal ---

function generateAGDLP(db) {
  console.log('\nAGDLP-structuur analyseren...');

  db.prepare('DELETE FROM agdlp_proposals').run();

  const groups = db.prepare(`
    SELECT g.name, g.category, g.scope, g.description
    FROM groups g
  `).all();

  const roles = db.prepare(`
    SELECT pr.id, pr.role_name, pr.role_layer
    FROM proposed_roles pr
  `).all();

  const insertProposal = db.prepare(`
    INSERT INTO agdlp_proposals (current_group, proposed_name, proposed_type, proposed_scope, nests_in, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Classify existing groups
  const KNOWN_PREFIXES = { 'GG-': 'Global', 'LG-': 'DomainLocal', 'DL-': 'DomainLocal', 'UG-': 'Universal', 'APP-': 'Resource', 'ROL-': 'Role', 'SEC-': 'Security' };
  let alreadyConformant = 0;
  let needsRename = 0;

  const tx = db.transaction(() => {
    // Phase 1: Propose GG- (Global Groups) for each role
    for (const role of roles) {
      const ggName = role.role_name.replace(/^ROL-/, 'GG-');
      insertProposal.run(
        role.role_name, ggName, 'Global', 'Global',
        null,
        `Rolgroep (AGDLP): bevat gebruikers met functie ${role.role_name}. Nest deze in DL-groepen voor resourcetoegang.`
      );
    }

    // Phase 2: Propose DL- (Domain Local Groups) for resource groups
    const roleGroupRows = db.prepare(`
      SELECT DISTINCT prg.group_name
      FROM proposed_role_groups prg
    `).all();

    const resourceGroups = new Set(roleGroupRows.map(r => r.group_name));

    for (const g of groups) {
      let hasKnownPrefix = false;
      for (const prefix of Object.keys(KNOWN_PREFIXES)) {
        if (g.name.toUpperCase().startsWith(prefix)) {
          hasKnownPrefix = true;
          alreadyConformant++;
          break;
        }
      }

      if (!hasKnownPrefix && resourceGroups.has(g.name)) {
        // This is a resource group without proper AGDLP naming
        const dlName = `DL-${sanitizeRoleName(g.name)}`;
        const scope = g.scope || 'DomainLocal';
        insertProposal.run(
          g.name, dlName, 'DomainLocal', scope,
          null,
          `Resourcegroep hernoemen naar DL-prefix (AGDLP). Scope instellen op DomainLocal.`
        );
        needsRename++;
      }
    }

    // Phase 3: Propose nesting (GG- into DL-)
    for (const role of roles) {
      const ggName = role.role_name.replace(/^ROL-/, 'GG-');
      const roleGroupsForThis = db.prepare('SELECT group_name FROM proposed_role_groups WHERE role_id = ?').all(role.id);

      for (const rg of roleGroupsForThis) {
        const dlName = resourceGroups.has(rg.group_name)
          ? `DL-${sanitizeRoleName(rg.group_name)}`
          : rg.group_name;
        insertProposal.run(
          ggName, ggName, 'NestVoorstel', 'Global',
          dlName,
          `Nest ${ggName} in ${dlName} voor resourcetoegang via AGDLP.`
        );
      }
    }
  });

  tx();

  const totalProposals = db.prepare('SELECT COUNT(*) as c FROM agdlp_proposals').get().c;
  console.log(`  ${totalProposals} AGDLP-voorstellen gegenereerd`);
  console.log(`  ${alreadyConformant} groepen volgen al een AGDLP-naamconventie`);
  console.log(`  ${needsRename} groepen moeten hernoemd worden`);
}

function detectOutliers(db, userGroupSets) {
  const assignedUsers = new Set(
    db.prepare('SELECT DISTINCT user_name FROM proposed_role_users').all().map(r => r.user_name)
  );

  const allEnabled = db.prepare('SELECT sam_account_name FROM users WHERE enabled = 1').all();
  const unassigned = allEnabled.filter(u => !assignedUsers.has(u.sam_account_name));

  if (unassigned.length > 0) {
    db.prepare(`
      INSERT INTO findings (severity, category, title, description, affected_object, affected_count, impact, recommendation, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'MEDIUM', 'rbac',
      `${unassigned.length} gebruikers passen in geen enkele voorgestelde rol`,
      `Accounts zonder functietitel of met unieke groepscombinatie. Top 10: ${unassigned.slice(0, 10).map(u => u.sam_account_name).join(', ')}`,
      'Meerdere accounts', unassigned.length,
      'Deze gebruikers vereisen handmatige review voor roltoewijzing.',
      'Vul ontbrekende functietitels in. Evalueer of deze accounts een standaardrol nodig hebben.',
      'NEN7510-A.9.2.1'
    );
  }
}

function analyzeNamingConventions(db) {
  const groups = db.prepare('SELECT name FROM groups').all();
  const patterns = {
    'APP-': 0, 'ROL-': 0, 'DL-': 0, 'SEC-': 0,
    'GG-': 0, 'LG-': 0, 'UG-': 0,
  };
  let noPrefix = 0;

  for (const g of groups) {
    let matched = false;
    for (const prefix of Object.keys(patterns)) {
      if (g.name.toUpperCase().startsWith(prefix)) {
        patterns[prefix]++;
        matched = true;
        break;
      }
    }
    if (!matched) noPrefix++;
  }

  if (noPrefix > 0) {
    db.prepare(`
      INSERT INTO findings (severity, category, title, description, affected_object, affected_count, impact, recommendation, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'LOW', 'naming',
      `${noPrefix} groepen zonder herkenbaar naamgevingspatroon`,
      `Huidige patronen: ${Object.entries(patterns).filter(([,v]) => v > 0).map(([k,v]) => `${k}* (${v})`).join(', ')}. ${noPrefix} groepen volgen geen patroon.`,
      'Meerdere groepen', noPrefix,
      'Inconsistente naamgeving bemoeilijkt beheer en audit.',
      'Voer een standaard naamconventie in: ROL- (rollen), APP- (applicaties), DL- (distributielijsten), SEC- (security).',
      'NEN7510-A.9.2.1'
    );
  }
}

function runRbac() {
  console.log('=== AD Opschonen — RBAC Voorstel ===\n');

  const db = getDatabase();

  const effectiveCount = db.prepare('SELECT COUNT(*) as c FROM effective_memberships').get().c;
  if (effectiveCount === 0) {
    console.error('Geen analyse-data gevonden. Draai eerst: npm run analyze');
    process.exit(1);
  }

  console.log('RBAC-rollen genereren (functie-eerst model)...\n');
  generateRoles(db);

  console.log('Naamconventies analyseren...');
  analyzeNamingConventions(db);

  // Layer 3: Application bundles
  detectAppBundles(db);

  // AGDLP structure proposal
  generateAGDLP(db);

  const roles = db.prepare(`
    SELECT role_name, role_layer, function_title, department, user_count, group_count
    FROM proposed_roles ORDER BY role_layer, role_name
  `).all();

  console.log(`\n=== ${roles.length} rollen voorgesteld ===\n`);

  const basisRoles = roles.filter(r => r.role_layer === 'basis');
  const afdelingsRoles = roles.filter(r => r.role_layer === 'afdeling');

  console.log(`Basisrollen (functie): ${basisRoles.length}`);
  for (const r of basisRoles.slice(0, 15)) {
    console.log(`  ${r.role_name}  (${r.user_count} users, ${r.group_count} groepen)`);
  }
  if (basisRoles.length > 15) console.log(`  ... en ${basisRoles.length - 15} meer`);

  console.log(`\nAfdelingsrollen (functie+afdeling): ${afdelingsRoles.length}`);
  for (const r of afdelingsRoles.slice(0, 15)) {
    console.log(`  ${r.role_name}  (${r.user_count} users, ${r.group_count} extra groepen)`);
  }
  if (afdelingsRoles.length > 15) console.log(`  ... en ${afdelingsRoles.length - 15} meer`);

  // Show bundles summary
  const bundles = db.prepare('SELECT bundle_name, group_count FROM app_bundles ORDER BY group_count DESC').all();
  if (bundles.length > 0) {
    console.log(`\nApplicatiebundels: ${bundles.length}`);
    for (const b of bundles.slice(0, 10)) {
      console.log(`  ${b.bundle_name}  (${b.group_count} groepen gebundeld)`);
    }
    if (bundles.length > 10) console.log(`  ... en ${bundles.length - 10} meer`);
  }

  // Show AGDLP summary
  const agdlpCount = db.prepare('SELECT COUNT(*) as c FROM agdlp_proposals').get().c;
  const nestCount = db.prepare("SELECT COUNT(*) as c FROM agdlp_proposals WHERE proposed_type = 'NestVoorstel'").get().c;
  const renameCount = db.prepare("SELECT COUNT(*) as c FROM agdlp_proposals WHERE proposed_type = 'DomainLocal' AND current_group != proposed_name").get().c;
  console.log(`\nAGDLP-voorstel: ${agdlpCount} items (${nestCount} nestkoppelingen, ${renameCount} hernoemingen)`);

  console.log('\nDraai nu: npm run simulate  (IST/SOLL vergelijking)');
  console.log('      of: npm run entra     (Entra ID + Access Packages)');
  console.log('      of: npm run report    (CLI-rapport)');

  const { closeDatabase } = require('./database'); closeDatabase();
}

if (require.main === module) {
  const { initEngine } = require('./database');
  initEngine().then(() => runRbac());
}

module.exports = { runRbac, generateRoles, detectAppBundles, generateAGDLP, clusterByFunction, jaccardSimilarity };
