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
  // Step 1: Group users by title (function-first per NIST/HL7)
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
  // Step 2: Within each function, sub-cluster by department
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

function detectOutliers(db, userGroupSets) {
  const assignedUsers = new Set(
    db.prepare('SELECT DISTINCT user_name FROM proposed_role_users').all().map(r => r.user_name)
  );

  const allEnabled = db.prepare('SELECT sam_account_name FROM users WHERE enabled = 1').all();
  const unassigned = allEnabled.filter(u => !assignedUsers.has(u.sam_account_name));

  if (unassigned.length > 0) {
    // Create a catch-all finding
    const { addFinding } = require('./analyzer');
    // Store as finding instead
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

  console.log('RBAC-rollen genereren (NIST/HL7 functie-eerst model)...\n');
  generateRoles(db);

  console.log('Naamconventies analyseren...');
  analyzeNamingConventions(db);

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

  console.log('\nDraai nu: npm run simulate  (IST/SOLL vergelijking)');
  console.log('      of: npm run report    (CLI-rapport)');

  db.close();
}

if (require.main === module) {
  runRbac();
}

module.exports = { runRbac, generateRoles, clusterByFunction, jaccardSimilarity };
