const { getDatabase } = require('./database');

const INVALID_CHARS = /[#%&*+\/\\=?{}|<>()[\];:,."!@^~`]/;
const MAX_GROUP_NAME_LENGTH = 256;
const MAX_DISPLAY_NAME_LENGTH = 256;

function addCheck(db, name, status, severity, count, details) {
  db.prepare(`
    INSERT INTO entra_checks (check_name, status, severity, affected_count, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, status, severity, count, details);
}

function checkGroupNames(db) {
  const groups = db.prepare('SELECT name FROM groups').all();
  const invalid = groups.filter(g => INVALID_CHARS.test(g.name));
  const tooLong = groups.filter(g => g.name.length > MAX_GROUP_NAME_LENGTH);

  if (invalid.length > 0) {
    addCheck(db, 'Ongeldige tekens in groepsnamen', 'FAIL', 'HIGH', invalid.length,
      `Groepen met ongeldige tekens voor Entra ID: ${invalid.slice(0, 10).map(g => g.name).join(', ')}`);
  } else {
    addCheck(db, 'Groepsnamen — ongeldige tekens', 'PASS', null, 0,
      'Alle groepsnamen zijn compatible met Entra ID.');
  }

  if (tooLong.length > 0) {
    addCheck(db, 'Groepsnamen te lang', 'FAIL', 'MEDIUM', tooLong.length,
      `Groepen met namen langer dan ${MAX_GROUP_NAME_LENGTH} tekens.`);
  }
}

function checkNesting(db) {
  const nested = db.prepare(`
    SELECT COUNT(DISTINCT group_name) as count FROM effective_memberships WHERE depth > 0
  `).get();

  if (nested.count > 0) {
    addCheck(db, 'Groepsnesting (niet ondersteund in Entra ID)', 'FAIL', 'CRITICAL', nested.count,
      `${nested.count} groepen zijn betrokken bij nesting. Entra ID ondersteunt geen geneste groepen voor licentietoewijzing en beperkt nesting voor Microsoft 365-groepen.`);
  } else {
    addCheck(db, 'Groepsnesting', 'PASS', null, 0,
      'Geen geneste groepen gedetecteerd.');
  }
}

function checkGroupTypes(db) {
  const security = db.prepare("SELECT COUNT(*) as c FROM groups WHERE category = 'Security'").get().c;
  const distribution = db.prepare("SELECT COUNT(*) as c FROM groups WHERE category = 'Distribution'").get().c;
  const unknown = db.prepare("SELECT COUNT(*) as c FROM groups WHERE category NOT IN ('Security', 'Distribution') OR category IS NULL").get().c;

  addCheck(db, 'Groepstypen', 'INFO', null, 0,
    `Security: ${security}, Distribution: ${distribution}, Onbekend: ${unknown}. Distribution-groepen worden in Entra ID geconverteerd naar mail-enabled security groups of Microsoft 365 Groups.`);

  const scopes = db.prepare(`
    SELECT scope, COUNT(*) as c FROM groups WHERE scope IS NOT NULL AND scope != ''
    GROUP BY scope
  `).all();

  const scopeStr = scopes.map(s => `${s.scope}: ${s.c}`).join(', ');
  addCheck(db, 'Groepsscopes', 'INFO', null, 0,
    `Verdeling: ${scopeStr}. Universal-groepen zijn het meest geschikt voor Entra ID-sync.`);
}

function checkUserEmails(db) {
  const noEmail = db.prepare(`
    SELECT COUNT(*) as c FROM users
    WHERE enabled = 1 AND (email = '' OR email IS NULL)
  `).get().c;

  if (noEmail > 0) {
    addCheck(db, 'Gebruikers zonder e-mailadres', 'FAIL', 'HIGH', noEmail,
      `${noEmail} actieve gebruikers hebben geen e-mailadres. UPN of e-mail is vereist voor Entra ID-synchronisatie.`);
  } else {
    addCheck(db, 'E-mailadressen', 'PASS', null, 0,
      'Alle actieve gebruikers hebben een e-mailadres.');
  }
}

function checkUPN(db) {
  const noUpn = db.prepare(`
    SELECT COUNT(*) as c FROM users
    WHERE enabled = 1 AND (upn = '' OR upn IS NULL)
  `).get().c;

  const duplicateUpns = db.prepare(`
    SELECT upn, COUNT(*) as c FROM users
    WHERE enabled = 1 AND upn IS NOT NULL AND upn != ''
    GROUP BY upn HAVING c > 1
  `).all();

  if (noUpn > 0) {
    addCheck(db, 'Gebruikers zonder UPN', 'FAIL', 'HIGH', noUpn,
      `${noUpn} actieve gebruikers hebben geen UserPrincipalName. UPN is vereist voor Entra ID.`);
  } else {
    addCheck(db, 'UserPrincipalName aanwezigheid', 'PASS', null, 0,
      'Alle actieve gebruikers hebben een UPN.');
  }

  if (duplicateUpns.length > 0) {
    const totalDupes = duplicateUpns.reduce((s, d) => s + d.c, 0);
    addCheck(db, 'Dubbele UPN-waarden', 'FAIL', 'CRITICAL', totalDupes,
      `${duplicateUpns.length} UPN-waarden komen meerdere keren voor: ${duplicateUpns.slice(0, 5).map(d => `${d.upn} (${d.c}x)`).join(', ')}`);
  }
}

function checkDisplayNames(db) {
  const noDisplayName = db.prepare(`
    SELECT COUNT(*) as c FROM users
    WHERE enabled = 1 AND (display_name = '' OR display_name IS NULL)
  `).get().c;

  if (noDisplayName > 0) {
    addCheck(db, 'Gebruikers zonder weergavenaam', 'FAIL', 'MEDIUM', noDisplayName,
      `${noDisplayName} actieve gebruikers hebben geen DisplayName.`);
  }
}

function checkManagedBy(db) {
  const unmanagedGroups = db.prepare(`
    SELECT COUNT(*) as c FROM groups
    WHERE managed_by = '' OR managed_by IS NULL
  `).get().c;

  const totalGroups = db.prepare('SELECT COUNT(*) as c FROM groups').get().c;
  const pct = totalGroups > 0 ? Math.round((unmanagedGroups / totalGroups) * 100) : 0;

  if (pct > 50) {
    addCheck(db, 'Groepen zonder eigenaar (ManagedBy)', 'WARN', 'MEDIUM', unmanagedGroups,
      `${unmanagedGroups} van ${totalGroups} groepen (${pct}%) hebben geen eigenaar. Eigenaarschap is belangrijk voor groepsbeheer in Entra ID.`);
  } else {
    addCheck(db, 'Groepseigenaarschap', 'PASS', null, 0,
      `${totalGroups - unmanagedGroups} van ${totalGroups} groepen hebben een eigenaar.`);
  }
}

function checkSyncReadiness(db) {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE enabled = 1').get().c;
  const totalGroups = db.prepare('SELECT COUNT(*) as c FROM groups').get().c;

  addCheck(db, 'Sync-scope', 'INFO', null, 0,
    `Scope: ${totalUsers} actieve gebruikers, ${totalGroups} groepen. Overweeg OU-gebaseerde filtering in Entra Connect om alleen relevante objecten te synchroniseren.`);
}

// --- Access Package Proposals ---

function generateAccessPackages(db) {
  console.log('\nAccess Package voorstellen genereren...');

  db.prepare('DELETE FROM entra_access_packages').run();

  const roles = db.prepare(`
    SELECT pr.id, pr.role_name, pr.role_layer, pr.function_title, pr.department
    FROM proposed_roles pr
  `).all();

  if (roles.length === 0) {
    console.log('  Geen rollen gevonden — draai eerst npm run rbac.');
    return;
  }

  const insertPackage = db.prepare(`
    INSERT INTO entra_access_packages (package_name, role_id, auto_assignment_rule, resources)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const role of roles) {
      // Build auto-assignment rule based on Entra dynamic group syntax
      let rule;
      if (role.role_layer === 'basis' && role.function_title) {
        rule = `(user.jobTitle -eq "${role.function_title}")`;
      } else if (role.role_layer === 'afdeling' && role.function_title && role.department) {
        rule = `(user.jobTitle -eq "${role.function_title}") and (user.department -eq "${role.department}")`;
      } else {
        rule = null;
      }

      // Gather resources: groups from this role + bundles linked to this role
      const roleGroups = db.prepare('SELECT group_name FROM proposed_role_groups WHERE role_id = ?').all(role.id);
      const roleBundles = db.prepare(`
        SELECT ab.bundle_name FROM app_bundle_roles abr
        JOIN app_bundles ab ON ab.id = abr.bundle_id
        WHERE abr.role_id = ?
      `).all(role.id);

      const resources = {
        groups: roleGroups.map(r => r.group_name),
        bundles: roleBundles.map(r => r.bundle_name),
      };

      const packageName = role.role_name.replace(/^ROL-/, 'PKG-');

      insertPackage.run(
        packageName,
        role.id,
        rule,
        JSON.stringify(resources)
      );
    }
  });

  tx();

  const count = db.prepare('SELECT COUNT(*) as c FROM entra_access_packages').get().c;
  console.log(`  ${count} Access Package voorstellen gegenereerd`);
}

// --- Dynamic Group Rules ---

function generateDynamicRules(db) {
  console.log('\nDynamic Group regels genereren...');

  db.prepare('DELETE FROM entra_dynamic_rules').run();

  const roles = db.prepare(`
    SELECT pr.id, pr.role_name, pr.role_layer, pr.function_title, pr.department
    FROM proposed_roles pr
  `).all();

  if (roles.length === 0) {
    console.log('  Geen rollen gevonden — draai eerst npm run rbac.');
    return;
  }

  const insertRule = db.prepare(`
    INSERT INTO entra_dynamic_rules (role_id, group_name, membership_rule, description)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const role of roles) {
      let membershipRule;
      let description;

      if (role.role_layer === 'basis' && role.function_title) {
        const groupName = `DYN-${role.role_name.replace(/^ROL-/, '')}`;
        membershipRule = `(user.jobTitle -eq "${role.function_title}")`;
        description = `Dynamische groep voor alle medewerkers met functie "${role.function_title}"`;

        insertRule.run(role.id, groupName, membershipRule, description);
      } else if (role.role_layer === 'afdeling' && role.function_title && role.department) {
        const groupName = `DYN-${role.role_name.replace(/^ROL-/, '')}`;
        membershipRule = `(user.jobTitle -eq "${role.function_title}") and (user.department -eq "${role.department}")`;
        description = `Dynamische groep voor "${role.function_title}" op afdeling "${role.department}"`;

        insertRule.run(role.id, groupName, membershipRule, description);
      }
    }
  });

  tx();

  const count = db.prepare('SELECT COUNT(*) as c FROM entra_dynamic_rules').get().c;
  console.log(`  ${count} dynamic group regels gegenereerd`);
}

function runEntraCheck() {
  console.log('=== AD Opschonen — Entra ID Gereedheidscheck ===\n');

  const db = getDatabase();

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    console.error('Geen data gevonden. Draai eerst: npm run import');
    process.exit(1);
  }

  db.prepare('DELETE FROM entra_checks').run();

  console.log('Checks uitvoeren...');
  checkGroupNames(db);
  checkNesting(db);
  checkGroupTypes(db);
  checkUserEmails(db);
  checkUPN(db);
  checkDisplayNames(db);
  checkManagedBy(db);
  checkSyncReadiness(db);

  // Generate Access Package and Dynamic Group proposals if RBAC data exists
  const roleCount = db.prepare('SELECT COUNT(*) as c FROM proposed_roles').get().c;
  if (roleCount > 0) {
    generateAccessPackages(db);
    generateDynamicRules(db);
  }

  const results = db.prepare(`
    SELECT check_name, status, severity, affected_count, details
    FROM entra_checks ORDER BY
      CASE status WHEN 'FAIL' THEN 1 WHEN 'WARN' THEN 2 WHEN 'INFO' THEN 3 WHEN 'PASS' THEN 4 END
  `).all();

  console.log('\n=== Resultaten ===\n');

  const statusSymbol = { FAIL: 'FAIL', WARN: 'WARN', PASS: ' OK ', INFO: 'INFO' };
  for (const r of results) {
    const sym = statusSymbol[r.status] || '????';
    const countStr = r.affected_count > 0 ? ` (${r.affected_count})` : '';
    console.log(`  [${sym}] ${r.check_name}${countStr}`);
    if (r.status === 'FAIL' || r.status === 'WARN') {
      console.log(`         ${r.details}`);
    }
  }

  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const passCount = results.filter(r => r.status === 'PASS').length;

  console.log(`\nTotaal: ${passCount} OK, ${warnCount} waarschuwingen, ${failCount} blokkerende problemen`);

  if (failCount > 0) {
    console.log('\nEntra ID-migratie wordt GEBLOKKEERD door bovenstaande FAIL-items.');
    console.log('Los deze op voordat u Entra Connect configureert.');
  } else if (warnCount > 0) {
    console.log('\nEntra ID-migratie is MOGELIJK, maar los de waarschuwingen op voor een schonere sync.');
  } else {
    console.log('\nEntra ID-migratie is GEREED. Geen blokkerende problemen gevonden.');
  }

  // Summary of Access Packages and Dynamic Rules
  if (roleCount > 0) {
    const pkgCount = db.prepare('SELECT COUNT(*) as c FROM entra_access_packages').get().c;
    const dynCount = db.prepare('SELECT COUNT(*) as c FROM entra_dynamic_rules').get().c;
    console.log(`\n--- Entra ID Migratievoorstellen ---`);
    console.log(`Access Packages: ${pkgCount}`);
    console.log(`Dynamic Group regels: ${dynCount}`);
    console.log('\nBekijk details in de webinterface: npm run viewer → Entra ID');
  }

  const { closeDatabase } = require('./database'); closeDatabase();
}

if (require.main === module) {
  const { initEngine } = require('./database');
  initEngine().then(() => runEntraCheck());
}

module.exports = { runEntraCheck, generateAccessPackages, generateDynamicRules };
