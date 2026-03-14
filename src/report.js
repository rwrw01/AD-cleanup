const { getDatabase, getStats, getMaxNestingDepth, getUsersWithMostGroups, getDepartmentSummary, getFindingsByCategory } = require('./database');

const NEN7510_MAPPING = {
  nesting:   'A.9.2.1 — Registratie en afmelding van gebruikers',
  stale:     'A.9.2.5 — Beoordeling van toegangsrechten',
  orphan:    'A.9.2.6 — Verwijdering of aanpassing van toegangsrechten',
  privilege: 'A.9.2.3 — Beheer van speciale toegangsrechten',
  password:  'A.9.4.3 — Systeem voor wachtwoordbeheer',
  service:   'A.9.4.3 — Systeem voor wachtwoordbeheer',
  overloaded:'A.9.2.1 — Registratie en afmelding van gebruikers',
  hierarchy: 'A.9.2.1 — Registratie en afmelding van gebruikers',
  rbac:      'A.9.1.2 — Toegang tot netwerken en netwerkdiensten',
  naming:    'A.9.2.1 — Registratie en afmelding van gebruikers',
  entra:     'A.9.1.1 — Beleid voor toegangsbeveiliging',
};

function computeMaturityScores(db, stats) {
  const scores = {};

  // Toegangsbeheer (RBAC maturity)
  const maxNesting = getMaxNestingDepth(db);
  const overloaded = db.prepare("SELECT COUNT(*) as c FROM findings WHERE category = 'overloaded'").get().c;
  if (maxNesting <= 1 && overloaded === 0) scores.toegangsbeheer = 5;
  else if (maxNesting <= 2) scores.toegangsbeheer = 4;
  else if (maxNesting <= 3) scores.toegangsbeheer = 3;
  else if (maxNesting <= 5) scores.toegangsbeheer = 2;
  else scores.toegangsbeheer = 1;

  // Accounthygiene (stale, orphan, disabled)
  const staleCount = db.prepare("SELECT SUM(affected_count) as c FROM findings WHERE category IN ('stale', 'orphan')").get().c || 0;
  const staleRatio = stats.users > 0 ? staleCount / stats.users : 0;
  if (staleRatio === 0) scores.accounthygiene = 5;
  else if (staleRatio < 0.02) scores.accounthygiene = 4;
  else if (staleRatio < 0.05) scores.accounthygiene = 3;
  else if (staleRatio < 0.1) scores.accounthygiene = 2;
  else scores.accounthygiene = 1;

  // Privileged access
  const privFindings = db.prepare("SELECT COUNT(*) as c FROM findings WHERE category = 'privilege'").get().c;
  if (privFindings === 0) scores.privileged_access = 5;
  else if (privFindings <= 2) scores.privileged_access = 3;
  else scores.privileged_access = 1;

  // Wachtwoordbeleid
  const pwdFindings = db.prepare("SELECT COUNT(*) as c FROM findings WHERE category = 'password'").get().c;
  if (pwdFindings === 0) scores.wachtwoordbeleid = 5;
  else if (pwdFindings <= 1) scores.wachtwoordbeleid = 3;
  else scores.wachtwoordbeleid = 1;

  // Entra ID gereedheid
  const entraFails = db.prepare("SELECT COUNT(*) as c FROM entra_checks WHERE status = 'FAIL'").get().c;
  if (entraFails === 0) scores.entra_gereedheid = 5;
  else if (entraFails <= 2) scores.entra_gereedheid = 3;
  else scores.entra_gereedheid = 1;

  // Overall
  const values = Object.values(scores);
  scores.overall = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 1;

  return scores;
}

function maturityLabel(score) {
  const labels = {
    1: 'Afwezig',
    2: 'Initieel',
    3: 'Herhaalbaar',
    4: 'Gedefinieerd',
    5: 'Best practice',
  };
  return labels[Math.round(score)] || 'Onbekend';
}

function printSeverityBlock(db, severity) {
  const findings = db.prepare(`
    SELECT title, description, affected_object, affected_count, impact, recommendation, reference, category
    FROM findings WHERE severity = ?
    ORDER BY category, affected_count DESC
  `).all(severity);

  if (findings.length === 0) return;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${severity} (${findings.length} bevindingen)`);
  console.log('='.repeat(70));

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const nen = NEN7510_MAPPING[f.category] || '';

    console.log(`\n  ${i + 1}. ${f.title}`);
    console.log(`     Omschrijving:  ${f.description}`);
    console.log(`     Object:        ${f.affected_object} (${f.affected_count} getroffen)`);
    console.log(`     Impact:        ${f.impact}`);
    console.log(`     Aanbeveling:   ${f.recommendation}`);
    if (nen) console.log(`     NEN7510:       ${nen}`);
    if (f.reference) console.log(`     Referentie:    ${f.reference}`);
  }
}

function runReport() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║            AD OPSCHONEN — ANALYSE RAPPORT                           ║');
  console.log('║            Active Directory Rationalisatie                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const db = getDatabase();
  const stats = getStats(db);

  if (stats.users === 0) {
    console.error('\nGeen data gevonden. Draai eerst: npm run import && npm run analyze');
    process.exit(1);
  }

  // Management samenvatting
  console.log('\n');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  MANAGEMENT SAMENVATTING');
  console.log('══════════════════════════════════════════════════════════════════════');

  const maxNesting = getMaxNestingDepth(db);
  const topUsers = getUsersWithMostGroups(db, 5);

  console.log(`\n  Datum:                    ${new Date().toISOString().split('T')[0]}`);
  console.log(`  Totaal gebruikers:        ${stats.users} (actief: ${stats.enabledUsers}, disabled: ${stats.disabledUsers})`);
  console.log(`  Totaal groepen:           ${stats.groups}`);
  console.log(`  Totaal lidmaatschappen:   ${stats.memberships}`);
  console.log(`  OUs:                      ${stats.ous}`);
  console.log(`  Service accounts:         ${stats.serviceAccounts}`);
  console.log(`  Afdelingen:               ${stats.departments}`);
  console.log(`  Unieke functies:          ${stats.titles}`);
  console.log(`  Maximale nestingdiepte:   ${maxNesting} niveaus`);
  console.log(`  Voorgestelde RBAC-rollen: ${stats.proposedRoles}`);

  console.log('\n  Bevindingen:');
  console.log(`    CRITICAL:  ${stats.criticalFindings}`);
  console.log(`    HIGH:      ${stats.highFindings}`);
  console.log(`    MEDIUM:    ${stats.mediumFindings}`);
  console.log(`    LOW:       ${stats.lowFindings}`);

  if (topUsers.length > 0) {
    console.log('\n  Meeste groepslidmaatschappen:');
    for (const u of topUsers) {
      console.log(`    ${u.user_name}: ${u.group_count} groepen`);
    }
  }

  // Maturity scores
  const scores = computeMaturityScores(db, stats);
  console.log('\n');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  MATURITY SCORES (1-5)');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`\n  ${'Domein'.padEnd(30)} ${'Score'.padStart(6)} Niveau`);
  console.log(`  ${'-'.repeat(55)}`);
  console.log(`  ${'Toegangsbeheer (RBAC)'.padEnd(30)} ${String(scores.toegangsbeheer).padStart(6)} ${maturityLabel(scores.toegangsbeheer)}`);
  console.log(`  ${'Accounthygiene'.padEnd(30)} ${String(scores.accounthygiene).padStart(6)} ${maturityLabel(scores.accounthygiene)}`);
  console.log(`  ${'Privileged Access'.padEnd(30)} ${String(scores.privileged_access).padStart(6)} ${maturityLabel(scores.privileged_access)}`);
  console.log(`  ${'Wachtwoordbeleid'.padEnd(30)} ${String(scores.wachtwoordbeleid).padStart(6)} ${maturityLabel(scores.wachtwoordbeleid)}`);
  console.log(`  ${'Entra ID Gereedheid'.padEnd(30)} ${String(scores.entra_gereedheid).padStart(6)} ${maturityLabel(scores.entra_gereedheid)}`);
  console.log(`  ${'-'.repeat(55)}`);
  console.log(`  ${'OVERALL'.padEnd(30)} ${String(scores.overall).padStart(6)} ${maturityLabel(Math.round(scores.overall))}`);

  // Bevindingen per severity
  printSeverityBlock(db, 'CRITICAL');
  printSeverityBlock(db, 'HIGH');
  printSeverityBlock(db, 'MEDIUM');
  printSeverityBlock(db, 'LOW');

  // Afdelingoverzicht
  const depts = getDepartmentSummary(db);
  if (depts.length > 0) {
    console.log('\n');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  AFDELINGOVERZICHT');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`\n  ${'Afdeling'.padEnd(35)} ${'Medew.'.padStart(7)} ${'Functies'.padStart(9)}`);
    console.log(`  ${'-'.repeat(55)}`);
    for (const d of depts.slice(0, 25)) {
      console.log(`  ${d.department.padEnd(35)} ${String(d.user_count).padStart(7)} ${String(d.title_count).padStart(9)}`);
    }
    if (depts.length > 25) console.log(`  ... en ${depts.length - 25} meer afdelingen`);
  }

  // RBAC voorstel samenvatting
  const roles = db.prepare(`
    SELECT role_layer, COUNT(*) as count, SUM(user_count) as total_users
    FROM proposed_roles GROUP BY role_layer
  `).all();

  if (roles.length > 0) {
    console.log('\n');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  RBAC VOORSTEL SAMENVATTING');
    console.log('══════════════════════════════════════════════════════════════════════');
    for (const r of roles) {
      console.log(`\n  ${r.role_layer === 'basis' ? 'Basisrollen (functie)' : 'Afdelingsrollen (functie+afdeling)'}: ${r.count}`);
    }
  }

  // Actielijst
  console.log('\n');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  ACTIELIJST');
  console.log('══════════════════════════════════════════════════════════════════════');

  const actions = [];
  if (stats.criticalFindings > 0)
    actions.push({ prio: 1, action: 'Los CRITICAL bevindingen op (privilege sprawl, circulaire nesting)' });
  if (stats.highFindings > 0)
    actions.push({ prio: 2, action: 'Adresseer HIGH bevindingen (diepe nesting, verweesde accounts, wachtwoorden)' });
  if (stats.proposedRoles > 0)
    actions.push({ prio: 3, action: 'Review RBAC-voorstel met afdelingshoofden' });
  actions.push({ prio: 4, action: 'Draai IST/SOLL simulatie (npm run simulate) en review met team' });
  actions.push({ prio: 5, action: 'Implementeer RBAC in pilot-afdeling' });
  actions.push({ prio: 6, action: 'Los Entra ID blokkerende items op (npm run entra)' });
  actions.push({ prio: 7, action: 'Stel periodieke hercertificering in (kwartaal-review)' });
  actions.push({ prio: 8, action: 'Documenteer GPO-koppeling aan groepen' });
  actions.push({ prio: 9, action: 'Draai analyse opnieuw na opschonen (before/after vergelijking)' });

  for (const a of actions) {
    console.log(`\n  ${a.prio}. ${a.action}`);
  }

  console.log('\n');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  Rapport gegenereerd op ' + new Date().toISOString());
  console.log('══════════════════════════════════════════════════════════════════════');

  db.close();
}

if (require.main === module) {
  runReport();
}

module.exports = { runReport, computeMaturityScores };
