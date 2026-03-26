const http = require('http');

async function test() {
  const start = Date.now();
  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  OK  ${msg}`); }
    else { failed++; console.log(`  FAIL ${msg}`); }
  }

  // 1. Init sql.js engine
  console.log('\n=== 1. sql.js engine ===');
  const { initEngine, getDatabase, getStats, getMaxNestingDepth } = require('../src/database');
  await initEngine();
  assert(true, 'initEngine() succesvol');

  // 2. Database openen + stats valideren
  console.log('\n=== 2. Database stats ===');
  const db = getDatabase();
  const stats = getStats(db);
  assert(stats.users === 7852, `Users: ${stats.users} (verwacht 7852)`);
  assert(stats.groups === 7036, `Groups: ${stats.groups} (verwacht 7036)`);
  assert(stats.memberships === 78218, `Memberships: ${stats.memberships} (verwacht 78218)`);
  assert(stats.findings > 0, `Findings: ${stats.findings} (>0)`);
  assert(stats.proposedRoles > 0, `Roles: ${stats.proposedRoles} (>0)`);

  const depth = getMaxNestingDepth(db);
  assert(depth === 5, `Max nesting depth: ${depth} (verwacht 5)`);
  db.close();

  // 3. Conformity analyse
  console.log('\n=== 3. Conformity analyse ===');
  const { runConformityAnalysis } = require('../src/design-conformity');
  const conf = runConformityAnalysis();
  assert(conf.totalUsers > 0, `Total users: ${conf.totalUsers}`);
  assert(conf.totalGroups > 0, `Total groups: ${conf.totalGroups}`);
  assert(Object.keys(conf.personaSummary).length > 5, `Persona types: ${Object.keys(conf.personaSummary).length}`);
  assert(conf.nestingViolations.length > 0, `Nesting violations: ${conf.nestingViolations.length}`);
  assert(conf.summary.nestingToRemove > 0, `Nesting to remove: ${conf.summary.nestingToRemove}`);
  assert(conf.technicalBreakdown && Object.keys(conf.technicalBreakdown).length > 0, `Technical breakdown types: ${Object.keys(conf.technicalBreakdown).length}`);

  // 4. View pages renderen
  console.log('\n=== 4. View pages ===');
  const pages = {
    dashboard: require('../src/views/page-dashboard'),
    groups: require('../src/views/page-groups'),
    users: require('../src/views/page-users'),
    problems: require('../src/views/page-problems'),
    rbac: require('../src/views/page-rbac'),
    simulator: require('../src/views/page-simulator'),
    entra: require('../src/views/page-entra'),
    conformity: require('../src/views/page-conformity'),
    config: require('../src/views/page-config'),
    personas: require('../src/views/page-personas'),
  };

  const defaultQuery = { q: '', severity: '', layer: '', type: '' };
  for (const [name, page] of Object.entries(pages)) {
    try {
      const html = page.render(defaultQuery);
      assert(html.length > 100, `${name}: ${html.length} bytes`);
    } catch (e) {
      assert(false, `${name}: ${e.message}`);
    }
  }

  // 5. Report generatie (re-init engine needed after conformity closed the db)
  console.log('\n=== 5. DOCX rapport ===');
  try {
    const { generateReport } = require('../src/report-docx');
    const doc = generateReport('Test Ziekenhuis');
    assert(doc != null, 'Rapport document aangemaakt');
  } catch (e) {
    assert(false, `Rapport generatie: ${e.message}`);
  }

  // 6. HTTP server test
  console.log('\n=== 6. HTTP server ===');
  const serverModule = require('../src/viewer');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const routes = ['/', '/dashboard', '/groups', '/users', '/problems', '/rbac', '/simulator', '/entra', '/conformity', '/config', '/personas', '/import', '/export'];

  for (const route of routes) {
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const status = await new Promise((resolve, reject) => {
        http.get(`http://localhost:3600${route}`, (res) => {
          res.resume();
          resolve(res.statusCode);
        }).on('error', reject);
      });
      assert(status === 200, `GET ${route}: ${status}`);
    } catch (e) {
      assert(false, `GET ${route}: ${e.message}`);
    }
  }

  // Summary
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`E2E Test: ${passed} passed, ${failed} failed (${elapsed}s)`);
  console.log(`${'='.repeat(50)}`);

  process.exit(failed > 0 ? 1 : 0);
}

test().catch(err => {
  console.error('E2E CRASH:', err);
  process.exit(1);
});
