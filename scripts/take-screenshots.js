const { chromium } = require(require('path').join(__dirname, '..', '..', '..', 'node_modules', 'playwright', 'index.js'));
const path = require('path');
const http = require('http');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 3600;
const BASE = `http://localhost:${PORT}`;

const PAGES = [
  { path: '/dashboard', name: 'dashboard', title: 'Dashboard' },
  { path: '/import', name: 'import', title: 'Import & Beheer' },
  { path: '/groups', name: 'groups', title: 'Groepen' },
  { path: '/users', name: 'users', title: 'Gebruikers' },
  { path: '/problems', name: 'problems', title: 'Problemen' },
  { path: '/rbac', name: 'rbac', title: 'RBAC Voorstel' },
  { path: '/simulator', name: 'simulator', title: 'IST/SOLL Simulatie' },
  { path: '/entra', name: 'entra', title: 'Entra ID Gereedheid' },
];

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(BASE, res => { res.resume(); resolve(); });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Server did not start');
}

(async () => {
  console.log('Waiting for server...');
  await waitForServer();
  console.log('Server is ready');

  const browser = await chromium.launch({
    executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  for (const page of PAGES) {
    const p = await context.newPage();
    const url = BASE + page.path;
    console.log(`Capturing ${page.title} (${url})...`);
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    const outPath = path.join(DOCS_DIR, `screenshot-${page.name}.png`);
    await p.screenshot({ path: outPath, fullPage: false });
    console.log(`  Saved: ${outPath}`);
    await p.close();
  }

  await browser.close();
  console.log('\nAll screenshots saved to docs/');
})();
