const { getDatabase, clearAnalysisData } = require('./database');

const ADMIN_GROUPS = [
  'Domain Admins', 'Enterprise Admins', 'Schema Admins',
  'Administrators', 'Account Operators', 'Server Operators',
  'Backup Operators', 'Print Operators', 'DnsAdmins',
  'Group Policy Creator Owners',
];

const STALE_DAYS = 90;
const PASSWORD_OLD_DAYS = 365;
const MAX_GROUPS_PER_USER = 50;
const MAX_NESTING_DEPTH = 3;

function addFinding(db, severity, category, title, description, affectedObject, affectedCount, impact, recommendation, reference) {
  db.prepare(`
    INSERT INTO findings (severity, category, title, description, affected_object, affected_count, impact, recommendation, reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(severity, category, title, description, affectedObject, affectedCount || 1, impact, recommendation, reference);
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function buildGroupGraph(db) {
  const rows = db.prepare("SELECT group_name, member_name FROM memberships WHERE member_type = 'group'").all();
  const graph = {};       // parent → children (groups that are members)
  const reverseGraph = {}; // child → parents

  for (const r of rows) {
    if (!graph[r.group_name]) graph[r.group_name] = [];
    graph[r.group_name].push(r.member_name);

    if (!reverseGraph[r.member_name]) reverseGraph[r.member_name] = [];
    reverseGraph[r.member_name].push(r.group_name);
  }
  return { graph, reverseGraph };
}

function detectCircularNesting(db, graph) {
  const circles = [];

  function dfs(node, visited, path) {
    if (visited.has(node)) {
      const idx = path.indexOf(node);
      if (idx >= 0) {
        circles.push(path.slice(idx).concat(node));
      }
      return;
    }
    visited.add(node);
    path.push(node);
    for (const child of (graph[node] || [])) {
      dfs(child, visited, path);
    }
    path.pop();
  }

  for (const node of Object.keys(graph)) {
    dfs(node, new Set(), []);
  }

  for (const circle of circles) {
    addFinding(db, 'CRITICAL', 'nesting',
      `Circulaire groepsnesting gedetecteerd`,
      `Keten: ${circle.join(' → ')}`,
      circle[0], circle.length - 1,
      'Circulaire nesting kan onverwachte toegang veroorzaken en prestatieproblemen bij groepsresolutie.',
      'Verbreek de cirkel door een van de geneste lidmaatschappen te verwijderen.',
      'CWE-1088'
    );
  }
  return circles;
}

function computeEffectiveMemberships(db, reverseGraph) {
  const userMemberships = db.prepare("SELECT group_name, member_name FROM memberships WHERE member_type = 'user'").all();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO effective_memberships (user_name, group_name, depth, path)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const m of userMemberships) {
      // Direct membership
      insertStmt.run(m.member_name, m.group_name, 0, m.group_name);

      // Walk up through nesting
      const visited = new Set([m.group_name]);
      const queue = [{ group: m.group_name, depth: 0, path: m.group_name }];

      while (queue.length > 0) {
        const current = queue.shift();
        const parents = reverseGraph[current.group] || [];
        for (const parent of parents) {
          if (visited.has(parent)) continue;
          visited.add(parent);
          const newDepth = current.depth + 1;
          const newPath = current.path + ' → ' + parent;
          insertStmt.run(m.member_name, parent, newDepth, newPath);
          queue.push({ group: parent, depth: newDepth, path: newPath });
        }
      }
    }
  });

  tx();
}

function analyzeNesting(db) {
  // Deep nesting
  const deepGroups = db.prepare(`
    SELECT group_name, MAX(depth) as max_depth, COUNT(DISTINCT user_name) as affected_users
    FROM effective_memberships
    WHERE depth > ?
    GROUP BY group_name
    ORDER BY max_depth DESC
  `).all(MAX_NESTING_DEPTH);

  for (const g of deepGroups) {
    addFinding(db, 'HIGH', 'nesting',
      `Diepe groepsnesting: ${g.group_name} (${g.max_depth} niveaus)`,
      `Groep ${g.group_name} heeft nesting tot ${g.max_depth} niveaus diep, wat ${g.affected_users} gebruikers raakt.`,
      g.group_name, g.affected_users,
      'Diepe nesting maakt het onmogelijk om te zien wie effectief welke rechten heeft. Niet compatible met Entra ID.',
      `Vervlak de nestingstructuur naar maximaal ${MAX_NESTING_DEPTH} niveaus. Gebruik directe lidmaatschappen.`,
      'NEN7510-A.9.2.1'
    );
  }

  if (deepGroups.length > 0) {
    addFinding(db, 'HIGH', 'nesting',
      `Totaal ${deepGroups.length} groepen met overmatige nesting (>${MAX_NESTING_DEPTH} niveaus)`,
      `${deepGroups.length} groepen overschrijden de maximale nestingdiepte van ${MAX_NESTING_DEPTH}.`,
      'Meerdere groepen', deepGroups.length,
      'Structureel probleem dat Entra ID-migratie blokkeert.',
      'Implementeer RBAC met platte groepsstructuur.',
      'NEN7510-A.9.2.1'
    );
  }
}

function analyzeEmptyGroups(db) {
  const empty = db.prepare(`
    SELECT g.name FROM groups g
    LEFT JOIN memberships m ON g.name = m.group_name OR g.sam_account_name = m.group_name
    WHERE m.id IS NULL
  `).all();

  if (empty.length > 0) {
    addFinding(db, 'MEDIUM', 'stale',
      `${empty.length} lege groepen zonder leden`,
      `Groepen: ${empty.slice(0, 10).map(e => e.name).join(', ')}${empty.length > 10 ? ` ... en ${empty.length - 10} meer` : ''}`,
      'Meerdere groepen', empty.length,
      'Lege groepen vervuilen de AD-structuur en bemoeilijken beheer.',
      'Verwijder ongebruikte groepen of documenteer waarom ze bestaan.',
      'NEN7510-A.9.2.5'
    );
  }
}

function analyzeStaleAccounts(db) {
  const now = new Date();
  const staleUsers = db.prepare(`
    SELECT sam_account_name, display_name, last_logon, department
    FROM users WHERE enabled = 1 AND last_logon != ''
  `).all().filter(u => daysSince(u.last_logon) > STALE_DAYS);

  if (staleUsers.length > 0) {
    addFinding(db, 'MEDIUM', 'stale',
      `${staleUsers.length} inactieve accounts (geen login >${STALE_DAYS} dagen)`,
      `Accounts die al meer dan ${STALE_DAYS} dagen niet zijn ingelogd maar nog actief zijn. Top 10: ${staleUsers.slice(0, 10).map(u => u.sam_account_name).join(', ')}`,
      'Meerdere accounts', staleUsers.length,
      'Inactieve accounts zijn een beveiligingsrisico (ongeautoriseerde toegang).',
      `Disable accounts die langer dan ${STALE_DAYS} dagen inactief zijn. Onderzoek of medewerkers nog in dienst zijn.`,
      'NEN7510-A.9.2.6'
    );
  }
}

function analyzeDisabledInGroups(db) {
  const orphaned = db.prepare(`
    SELECT DISTINCT u.sam_account_name, COUNT(DISTINCT m.group_name) as group_count
    FROM users u
    JOIN memberships m ON u.sam_account_name = m.member_name
    WHERE u.enabled = 0
    GROUP BY u.sam_account_name
  `).all();

  if (orphaned.length > 0) {
    const totalMemberships = orphaned.reduce((s, o) => s + o.group_count, 0);
    addFinding(db, 'HIGH', 'orphan',
      `${orphaned.length} disabled accounts zitten nog in groepen (${totalMemberships} lidmaatschappen)`,
      `Disabled accounts die nog lid zijn van groepen. Top 10: ${orphaned.slice(0, 10).map(o => `${o.sam_account_name} (${o.group_count} groepen)`).join(', ')}`,
      'Meerdere accounts', orphaned.length,
      'Verweesde groepslidmaatschappen kunnen misbruikt worden als het account opnieuw geactiveerd wordt.',
      'Verwijder disabled accounts uit alle groepen.',
      'NEN7510-A.9.2.6'
    );
  }
}

function analyzePasswordPolicy(db) {
  const neverExpires = db.prepare(`
    SELECT sam_account_name, display_name, department
    FROM users WHERE enabled = 1 AND password_never_expires = 1
  `).all();

  if (neverExpires.length > 0) {
    addFinding(db, 'HIGH', 'password',
      `${neverExpires.length} actieve accounts met "wachtwoord verloopt nooit"`,
      `Accounts waarbij het wachtwoord nooit verloopt. Top 10: ${neverExpires.slice(0, 10).map(u => u.sam_account_name).join(', ')}`,
      'Meerdere accounts', neverExpires.length,
      'Wachtwoorden die nooit verlopen zijn een significant beveiligingsrisico, zeker in de zorg.',
      'Stel wachtwoordverlooopbeleid in volgens NEN7510 (max 90 dagen). Overweeg MFA.',
      'NEN7510-A.9.4.3'
    );
  }

  const oldPasswords = db.prepare(`
    SELECT sam_account_name, password_last_set FROM users
    WHERE enabled = 1 AND password_last_set != ''
  `).all().filter(u => daysSince(u.password_last_set) > PASSWORD_OLD_DAYS);

  if (oldPasswords.length > 0) {
    addFinding(db, 'HIGH', 'password',
      `${oldPasswords.length} accounts met wachtwoord ouder dan ${PASSWORD_OLD_DAYS} dagen`,
      `Accounts waarvan het wachtwoord al meer dan een jaar niet is gewijzigd.`,
      'Meerdere accounts', oldPasswords.length,
      'Oude wachtwoorden verhogen het risico op credential-gebaseerde aanvallen.',
      'Forceer wachtwoordwijziging bij volgende login.',
      'NEN7510-A.9.4.3'
    );
  }
}

function analyzeOverloadedUsers(db) {
  const overloaded = db.prepare(`
    SELECT user_name, COUNT(*) as group_count
    FROM effective_memberships
    GROUP BY user_name
    HAVING group_count > ?
    ORDER BY group_count DESC
  `).all(MAX_GROUPS_PER_USER);

  if (overloaded.length > 0) {
    addFinding(db, 'HIGH', 'overloaded',
      `${overloaded.length} gebruikers in meer dan ${MAX_GROUPS_PER_USER} groepen`,
      `Gebruikers met buitensporig veel groepslidmaatschappen. Top 10: ${overloaded.slice(0, 10).map(u => `${u.user_name} (${u.group_count})`).join(', ')}`,
      'Meerdere gebruikers', overloaded.length,
      'Te veel groepslidmaatschappen duiden op gebrek aan RBAC en maken audit onmogelijk. Kan ook Kerberos-tokenproblemen veroorzaken.',
      'Implementeer RBAC zodat gebruikers een beperkt aantal rollen krijgen in plaats van directe groepstoewijzingen.',
      'NEN7510-A.9.2.1'
    );
  }
}

function analyzePrivilegedAccess(db) {
  for (const adminGroup of ADMIN_GROUPS) {
    const members = db.prepare(`
      SELECT em.user_name, em.depth, em.path
      FROM effective_memberships em
      WHERE em.group_name = ?
    `).all(adminGroup);

    if (members.length === 0) continue;

    const directMembers = members.filter(m => m.depth === 0);
    const nestedMembers = members.filter(m => m.depth > 0);

    if (members.length > 0) {
      addFinding(db, 'CRITICAL', 'privilege',
        `${members.length} accounts in ${adminGroup}`,
        `Leden (direct: ${directMembers.length}, via nesting: ${nestedMembers.length}): ${members.slice(0, 10).map(m => m.user_name + (m.depth > 0 ? ` (via ${m.path})` : '')).join(', ')}`,
        adminGroup, members.length,
        'Privileged accounts zijn het primaire doelwit bij aanvallen. Elk onnodig admin-account vergroot het aanvalsoppervlak.',
        'Beperk admin-accounts tot het absolute minimum. Gebruik Privileged Access Workstations (PAW) en just-in-time access.',
        'NEN7510-A.9.2.3'
      );
    }

    if (nestedMembers.length > 0) {
      addFinding(db, 'CRITICAL', 'privilege',
        `${nestedMembers.length} accounts indirect lid van ${adminGroup} via nesting`,
        `Deze accounts hebben admin-rechten via geneste groepen, wat vaak onbedoeld is. Paden: ${nestedMembers.slice(0, 5).map(m => m.path).join('; ')}`,
        adminGroup, nestedMembers.length,
        'Onzichtbare admin-rechten via nesting zijn het grootste risico in een vervuilde AD.',
        'Verwijder geneste admin-lidmaatschappen. Alleen directe, gedocumenteerde toewijzingen.',
        'NEN7510-A.9.2.3'
      );
    }
  }
}

function analyzeServiceAccounts(db) {
  const oldPwdAccounts = db.prepare(`
    SELECT sam_account_name, password_last_set, description
    FROM service_accounts WHERE enabled = 1 AND password_last_set != ''
  `).all().filter(sa => daysSince(sa.password_last_set) > PASSWORD_OLD_DAYS);

  if (oldPwdAccounts.length > 0) {
    addFinding(db, 'HIGH', 'service',
      `${oldPwdAccounts.length} service accounts met wachtwoord ouder dan ${PASSWORD_OLD_DAYS} dagen`,
      `Service accounts waarvan het wachtwoord al meer dan een jaar niet is gewijzigd: ${oldPwdAccounts.slice(0, 10).map(sa => sa.sam_account_name).join(', ')}`,
      'Meerdere service accounts', oldPwdAccounts.length,
      'Service accounts met oude wachtwoorden zijn kwetsbaar voor credential-aanvallen (Kerberoasting).',
      'Roteer wachtwoorden van service accounts. Overweeg Group Managed Service Accounts (gMSA).',
      'NEN7510-A.9.4.3'
    );
  }

  const noLoginAccounts = db.prepare(`
    SELECT sam_account_name, description FROM service_accounts
    WHERE enabled = 1 AND (last_logon = '' OR last_logon IS NULL)
  `).all();

  if (noLoginAccounts.length > 0) {
    addFinding(db, 'MEDIUM', 'service',
      `${noLoginAccounts.length} service accounts zonder recente login`,
      `Service accounts die actief zijn maar nooit of lang niet ingelogd: ${noLoginAccounts.slice(0, 10).map(sa => sa.sam_account_name).join(', ')}`,
      'Meerdere service accounts', noLoginAccounts.length,
      'Ongebruikte service accounts zijn onnodige aanvalsvectoren.',
      'Onderzoek of deze service accounts nog nodig zijn. Disable ongebruikte accounts.',
      'NEN7510-A.9.2.5'
    );
  }
}

function analyzeManagerHierarchy(db) {
  const noManager = db.prepare(`
    SELECT sam_account_name, display_name, department, title
    FROM users WHERE enabled = 1 AND (manager_sam = '' OR manager_sam IS NULL)
  `).all();

  // Filter out likely top-level (no department likely means system account)
  const realNoManager = noManager.filter(u => u.department && u.title);

  if (realNoManager.length > 0) {
    addFinding(db, 'MEDIUM', 'hierarchy',
      `${realNoManager.length} medewerkers zonder manager in AD`,
      `Actieve accounts met functie en afdeling maar zonder manager-verwijzing. Top 10: ${realNoManager.slice(0, 10).map(u => `${u.sam_account_name} (${u.department}/${u.title})`).join(', ')}`,
      'Meerdere accounts', realNoManager.length,
      'Ontbrekende manager-relaties maken goedkeuringsflows en access reviews onmogelijk.',
      'Vul het manager-veld in voor alle medewerkers. Dit is essentieel voor RBAC en access certifications.',
      'NEN7510-A.9.2.1'
    );
  }

  // Check for managers that don't exist
  const invalidManagers = db.prepare(`
    SELECT u.sam_account_name, u.manager_sam
    FROM users u
    WHERE u.enabled = 1 AND u.manager_sam != '' AND u.manager_sam IS NOT NULL
    AND u.manager_sam NOT IN (SELECT sam_account_name FROM users)
  `).all();

  if (invalidManagers.length > 0) {
    addFinding(db, 'MEDIUM', 'hierarchy',
      `${invalidManagers.length} accounts verwijzen naar niet-bestaande manager`,
      `Accounts met een manager-verwijzing naar een onbekend account: ${invalidManagers.slice(0, 10).map(u => `${u.sam_account_name} → ${u.manager_sam}`).join(', ')}`,
      'Meerdere accounts', invalidManagers.length,
      'Ongeldige manager-relaties verstoren organisatorische workflows.',
      'Corrigeer de manager-verwijzingen in AD.',
      'NEN7510-A.9.2.1'
    );
  }
}

function runAnalysis() {
  console.log('=== AD Opschonen — Analyse ===\n');

  const db = getDatabase();

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    console.error('Geen data gevonden. Draai eerst: npm run import');
    process.exit(1);
  }

  clearAnalysisData(db);

  console.log('Groepsgraph opbouwen...');
  const { graph, reverseGraph } = buildGroupGraph(db);

  console.log('Circulaire nesting detecteren...');
  const circles = detectCircularNesting(db, graph);
  console.log(`  ${circles.length} circulaire ketens gevonden`);

  console.log('Effectieve lidmaatschappen berekenen...');
  computeEffectiveMemberships(db, reverseGraph);
  const effectiveCount = db.prepare('SELECT COUNT(*) as c FROM effective_memberships').get().c;
  console.log(`  ${effectiveCount} effectieve lidmaatschappen berekend`);

  console.log('Nesting analyseren...');
  analyzeNesting(db);

  console.log('Lege groepen zoeken...');
  analyzeEmptyGroups(db);

  console.log('Inactieve accounts analyseren...');
  analyzeStaleAccounts(db);

  console.log('Verweesde accounts zoeken...');
  analyzeDisabledInGroups(db);

  console.log('Wachtwoordbeleid controleren...');
  analyzePasswordPolicy(db);

  console.log('Overbelaste gebruikers detecteren...');
  analyzeOverloadedUsers(db);

  console.log('Privileged access review...');
  analyzePrivilegedAccess(db);

  console.log('Service accounts analyseren...');
  analyzeServiceAccounts(db);

  console.log('Manager-hierarchie valideren...');
  analyzeManagerHierarchy(db);

  const findingCounts = db.prepare(`
    SELECT severity, COUNT(*) as count FROM findings GROUP BY severity
    ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 END
  `).all();

  console.log('\n=== Analyse compleet ===');
  console.log('Bevindingen:');
  for (const f of findingCounts) {
    console.log(`  ${f.severity}: ${f.count}`);
  }
  console.log('\nDraai nu: npm run rbac  (RBAC-voorstel)');
  console.log('      of: npm run report (CLI-rapport)');

  const { closeDatabase } = require('./database'); closeDatabase();
}

if (require.main === module) {
  const { initEngine } = require('./database');
  initEngine().then(() => runAnalysis());
}

module.exports = {
  runAnalysis,
  buildGroupGraph,
  computeEffectiveMemberships,
  detectCircularNesting,
  daysSince,
  ADMIN_GROUPS,
};
