const { getDatabase } = require('./database');

function buildIst(db) {
  // Current state: all effective memberships per user
  const rows = db.prepare(`
    SELECT em.user_name, em.group_name, em.depth, em.path,
           u.department, u.title
    FROM effective_memberships em
    LEFT JOIN users u ON em.user_name = u.sam_account_name
    ORDER BY em.user_name, em.group_name
  `).all();

  const ist = {};
  for (const r of rows) {
    if (!ist[r.user_name]) {
      ist[r.user_name] = {
        department: r.department || '',
        title: r.title || '',
        groups: new Set(),
      };
    }
    ist[r.user_name].groups.add(r.group_name);
  }
  return ist;
}

function buildSoll(db) {
  // Proposed state: groups from assigned roles
  const roleUsers = db.prepare(`
    SELECT pru.user_name, pr.role_name, prg.group_name
    FROM proposed_role_users pru
    JOIN proposed_roles pr ON pru.role_id = pr.id
    JOIN proposed_role_groups prg ON prg.role_id = pr.id
    WHERE pru.is_outlier = 0
  `).all();

  const soll = {};
  for (const r of roleUsers) {
    if (!soll[r.user_name]) {
      soll[r.user_name] = { roles: new Set(), groups: new Set(), bundles: new Set() };
    }
    soll[r.user_name].roles.add(r.role_name);
    soll[r.user_name].groups.add(r.group_name);
  }

  // Include groups from application bundles linked to user's roles
  const bundleGroups = db.prepare(`
    SELECT pru.user_name, ab.bundle_name, abg.group_name
    FROM proposed_role_users pru
    JOIN app_bundle_roles abr ON abr.role_id = pru.role_id
    JOIN app_bundles ab ON ab.id = abr.bundle_id
    JOIN app_bundle_groups abg ON abg.bundle_id = ab.id
    WHERE pru.is_outlier = 0
  `).all();

  for (const r of bundleGroups) {
    if (!soll[r.user_name]) {
      soll[r.user_name] = { roles: new Set(), groups: new Set(), bundles: new Set() };
    }
    soll[r.user_name].groups.add(r.group_name);
    soll[r.user_name].bundles.add(r.bundle_name);
  }

  return soll;
}

function computeDiff(ist, soll) {
  const results = [];
  const allUsers = new Set([...Object.keys(ist), ...Object.keys(soll)]);

  for (const user of allUsers) {
    const currentGroups = ist[user] ? ist[user].groups : new Set();
    const proposedGroups = soll[user] ? soll[user].groups : new Set();

    const added = [...proposedGroups].filter(g => !currentGroups.has(g));
    const removed = [...currentGroups].filter(g => !proposedGroups.has(g));
    const kept = [...currentGroups].filter(g => proposedGroups.has(g));

    results.push({
      user,
      department: ist[user] ? ist[user].department : '',
      title: ist[user] ? ist[user].title : '',
      roles: soll[user] ? [...soll[user].roles] : [],
      currentCount: currentGroups.size,
      proposedCount: proposedGroups.size,
      addedCount: added.length,
      removedCount: removed.length,
      keptCount: kept.length,
      added,
      removed,
      kept,
      hasRiskOfAccessLoss: removed.length > 0,
      netChange: proposedGroups.size - currentGroups.size,
    });
  }

  return results;
}

function storeResults(db, diffs) {
  db.prepare('DELETE FROM simulation_results').run();

  const stmt = db.prepare(`
    INSERT INTO simulation_results (user_name, change_type, group_name, role_name, risk_level, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const d of diffs) {
      const roleStr = d.roles.join(', ');

      for (const g of d.added) {
        stmt.run(d.user, 'TOEVOEGEN', g, roleStr, 'LAAG', 'Nieuwe groep via rolvoorstel');
      }
      for (const g of d.removed) {
        stmt.run(d.user, 'VERWIJDEREN', g, roleStr, 'HOOG',
          'Huidige toegang vervalt — controleer of dit gewenst is');
      }
      for (const g of d.kept) {
        stmt.run(d.user, 'BEHOUDEN', g, roleStr, 'GEEN', 'Ongewijzigd');
      }
    }
  });

  tx();
}

function printSummary(diffs) {
  const totalUsers = diffs.length;
  const usersWithChanges = diffs.filter(d => d.addedCount > 0 || d.removedCount > 0).length;
  const usersLosingAccess = diffs.filter(d => d.removedCount > 0).length;
  const totalAdded = diffs.reduce((s, d) => s + d.addedCount, 0);
  const totalRemoved = diffs.reduce((s, d) => s + d.removedCount, 0);
  const avgCurrentGroups = totalUsers > 0 ? (diffs.reduce((s, d) => s + d.currentCount, 0) / totalUsers).toFixed(1) : 0;
  const avgProposedGroups = totalUsers > 0 ? (diffs.reduce((s, d) => s + d.proposedCount, 0) / totalUsers).toFixed(1) : 0;

  console.log('\n=== IST/SOLL Vergelijking ===\n');
  console.log(`Totaal gebruikers:                ${totalUsers}`);
  console.log(`Gebruikers met wijzigingen:        ${usersWithChanges}`);
  console.log(`Gebruikers die toegang verliezen:  ${usersLosingAccess}`);
  console.log('');
  console.log(`Gemiddeld groepen per user (IST):  ${avgCurrentGroups}`);
  console.log(`Gemiddeld groepen per user (SOLL): ${avgProposedGroups}`);
  console.log('');
  console.log(`Totaal toe te voegen:              ${totalAdded}`);
  console.log(`Totaal te verwijderen:             ${totalRemoved}`);

  // Department breakdown
  const byDept = {};
  for (const d of diffs) {
    const dept = d.department || 'Onbekend';
    if (!byDept[dept]) byDept[dept] = { users: 0, added: 0, removed: 0, riskUsers: 0 };
    byDept[dept].users++;
    byDept[dept].added += d.addedCount;
    byDept[dept].removed += d.removedCount;
    if (d.removedCount > 0) byDept[dept].riskUsers++;
  }

  console.log('\n--- Per afdeling ---');
  console.log(`${'Afdeling'.padEnd(30)} ${'Users'.padStart(6)} ${'Toevoeg'.padStart(8)} ${'Verwijder'.padStart(10)} ${'Risico'.padStart(7)}`);
  console.log('-'.repeat(65));

  const sortedDepts = Object.entries(byDept).sort((a, b) => b[1].removed - a[1].removed);
  for (const [dept, stats] of sortedDepts) {
    console.log(
      `${dept.padEnd(30)} ${String(stats.users).padStart(6)} ${String(stats.added).padStart(8)} ${String(stats.removed).padStart(10)} ${String(stats.riskUsers).padStart(7)}`
    );
  }

  // Top users losing access
  const riskUsers = diffs.filter(d => d.removedCount > 0).sort((a, b) => b.removedCount - a.removedCount);
  if (riskUsers.length > 0) {
    console.log('\n--- Meeste vervallende toegang ---');
    for (const u of riskUsers.slice(0, 15)) {
      console.log(`  ${u.user} (${u.title || '-'}, ${u.department || '-'}): -${u.removedCount} groepen`);
      for (const g of u.removed.slice(0, 5)) {
        console.log(`    - ${g}`);
      }
      if (u.removed.length > 5) console.log(`    ... en ${u.removed.length - 5} meer`);
    }
  }
}

function runSimulation() {
  console.log('=== AD Opschonen — IST/SOLL Simulatie (dry-run) ===\n');

  const db = getDatabase();

  const roleCount = db.prepare('SELECT COUNT(*) as c FROM proposed_roles').get().c;
  if (roleCount === 0) {
    console.error('Geen RBAC-voorstel gevonden. Draai eerst: npm run rbac');
    process.exit(1);
  }

  console.log('IST-situatie ophalen (huidige groepslidmaatschappen)...');
  const ist = buildIst(db);
  console.log(`  ${Object.keys(ist).length} gebruikers met effectieve lidmaatschappen`);

  console.log('SOLL-situatie berekenen (voorgestelde roltoewijzingen + bundels)...');
  const soll = buildSoll(db);
  const usersWithBundles = Object.values(soll).filter(s => s.bundles && s.bundles.size > 0).length;
  console.log(`  ${Object.keys(soll).length} gebruikers met rolvoorstellen`);
  if (usersWithBundles > 0) {
    console.log(`  ${usersWithBundles} gebruikers profiteren van applicatiebundels`);
  }

  console.log('Vergelijking berekenen...');
  const diffs = computeDiff(ist, soll);

  console.log('Resultaten opslaan...');
  storeResults(db, diffs);

  printSummary(diffs);

  console.log('\nDraai nu: npm run report   (volledig rapport)');
  console.log('      of: npm run viewer   (webinterface)');

  const { closeDatabase } = require('./database'); closeDatabase();
}

if (require.main === module) {
  const { initEngine } = require('./database');
  initEngine().then(() => runSimulation());
}

module.exports = { runSimulation, buildIst, buildSoll, computeDiff };
