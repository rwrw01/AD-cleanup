const http = require('http');
const fs = require('fs');
const path = require('path');
const { getDatabase, closeDatabase, clearImportData, clearAnalysisData, DATA_DIR } = require('./database');

const PORT = parseInt(process.env.PORT, 10) || 3600;

const pageDashboard = require('./views/page-dashboard');
const pageGroups = require('./views/page-groups');
const pageUsers = require('./views/page-users');
const pageProblems = require('./views/page-problems');
const pageRbac = require('./views/page-rbac');
const pageSimulator = require('./views/page-simulator');
const pageEntra = require('./views/page-entra');
const pageConformity = require('./views/page-conformity');
const pageConfig = require('./views/page-config');
const pagePersonas = require('./views/page-personas');
const pageHelp = require('./views/page-help');

function parseQuery(urlStr) {
  // WHATWG URL API instead of deprecated url.parse() (DEP0169)
  const parsed = new URL(urlStr, 'http://localhost');
  const query = {};
  for (const [key, value] of parsed.searchParams) {
    query[key] = value;
  }
  return { pathname: parsed.pathname, query };
}

function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      if (req.headers['content-type'] === 'application/json') {
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      } else {
        const params = new URLSearchParams(body);
        const data = {};
        for (const [k, v] of params) data[k] = v;
        resolve(data);
      }
    });
    req.on('error', reject);
  });
}

function sendHtml(res, html, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  res.end(html);
}

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleImportUpload(req, res) {
  // Handle multipart file upload
  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) {
    sendJson(res, { error: 'Missing boundary' }, 400);
    return;
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const body = buffer.toString('binary');
    const parts = body.split('--' + boundary).slice(1, -1);

    const importDir = path.join(DATA_DIR, 'imports');
    fs.mkdirSync(importDir, { recursive: true });

    let fileCount = 0;
    for (const part of parts) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      const headers = part.substring(0, headerEnd);
      const content = part.substring(headerEnd + 4).replace(/\r\n$/, '');

      const filenameMatch = headers.match(/filename="([^"]+)"/);
      if (!filenameMatch) continue;
      const filename = path.basename(filenameMatch[1]);
      if (!filename.endsWith('.csv')) continue;

      fs.writeFileSync(path.join(importDir, filename), content, 'binary');
      fileCount++;
    }

    if (fileCount > 0) {
      // Run import
      try {
        const { runImport } = require('./importer');
        runImport();
        sendJson(res, { success: true, message: `${fileCount} bestanden geimporteerd. Draai nu Analyse.` });
      } catch (err) {
        sendJson(res, { error: err.message }, 500);
      }
    } else {
      sendJson(res, { error: 'Geen CSV-bestanden gevonden' }, 400);
    }
  });
}

function checkPrerequisites(action, db) {
  const counts = {
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    effective: db.prepare('SELECT COUNT(*) as c FROM effective_memberships').get().c,
    roles: db.prepare('SELECT COUNT(*) as c FROM proposed_roles').get().c,
  };

  const prerequisites = {
    analyze: {
      check: () => counts.users > 0,
      error: 'Stap 1 niet afgerond: importeer eerst data via Import.',
      step: 2,
    },
    rbac: {
      check: () => counts.effective > 0,
      error: 'Stap 2 niet afgerond: draai eerst de Analyse.',
      step: 3,
    },
    simulate: {
      check: () => counts.roles > 0,
      error: 'Stap 3 niet afgerond: genereer eerst het RBAC-voorstel.',
      step: 4,
    },
    entra: {
      check: () => counts.roles > 0,
      error: 'Stap 3 niet afgerond: genereer eerst het RBAC-voorstel.',
      step: 5,
    },
    'export-docx': {
      check: () => counts.roles > 0,
      error: 'Stap 3 niet afgerond: genereer eerst het RBAC-voorstel.',
      step: 6,
    },
  };

  const prereq = prerequisites[action];
  if (!prereq) return null;
  if (!prereq.check()) return prereq.error;
  return null;
}

async function handleRunAction(action, res) {
  try {
    if (action === 'analyze' || action === 'rbac' || action === 'simulate' || action === 'entra' || action === 'export-docx') {
      const db = getDatabase();
      const error = checkPrerequisites(action, db);
      if (error) {
        sendJson(res, { error }, 400);
        return;
      }
    }

    if (action === 'analyze') {
      const { runAnalysis } = require('./analyzer');
      runAnalysis();
      sendJson(res, { success: true, message: 'Analyse compleet.' });
    } else if (action === 'rbac') {
      const { runRbac } = require('./rbac-engine');
      runRbac();
      sendJson(res, { success: true, message: 'RBAC-voorstel gegenereerd.' });
    } else if (action === 'simulate') {
      const { runSimulation } = require('./simulator');
      runSimulation();
      sendJson(res, { success: true, message: 'IST/SOLL simulatie compleet.' });
    } else if (action === 'entra') {
      const { runEntraCheck } = require('./entra-readiness');
      runEntraCheck();
      sendJson(res, { success: true, message: 'Entra ID check compleet.' });
    } else if (action === 'export-docx') {
      const orgName = res._exportOrgName || 'Organisatie';
      const { runReport } = require('./report-docx');
      const outputPath = await runReport(orgName);
      const filename = path.basename(outputPath);
      sendJson(res, { success: true, message: `Rapport gegenereerd: ${filename}`, filename });
    } else if (action === 'import-from-ps') {
      const { runImport } = require('./importer');
      runImport();
      sendJson(res, { success: true, message: 'Import vanuit PowerShell-export geslaagd.' });
    } else if (action === 'clear-analysis') {
      const db = getDatabase();
      clearAnalysisData(db);
      closeDatabase();
      sendJson(res, { success: true, message: 'Analyse-data gewist. Import-data behouden.' });
    } else if (action === 'clear-all') {
      const db = getDatabase();
      clearImportData(db);
      closeDatabase();
      sendJson(res, { success: true, message: 'Alle data gewist. Database is leeg.' });
    } else {
      sendJson(res, { error: 'Onbekende actie: ' + action }, 400);
    }
  } catch (err) {
    console.error(`Error running ${action}:`, err);
    sendJson(res, { error: err.message }, 500);
  }
}

const { renderLayout } = require('./views/layout');

function renderImportPage() {
  const importDir = path.join(DATA_DIR, 'imports');
  let existingFiles = [];
  try { existingFiles = fs.readdirSync(importDir).filter(f => f.endsWith('.csv')); } catch {}

  const db = getDatabase();
  const lastImport = db.prepare('SELECT * FROM import_sessions ORDER BY id DESC LIMIT 1').get();

  let body = `
    <h1>Import & Beheer</h1>

    <h2>Stap 1: AD-gegevens exporteren via PowerShell</h2>
    <p style="color:#858585; font-size:13px;">Voer de AD-export scripts direct uit. Vereist PowerShell met ActiveDirectory module (RSAT). De CSV-bestanden worden automatisch geimporteerd na de export.</p>
    <div class="card" style="margin:12px 0; background:#252526; border:1px solid #3c3c3c; border-radius:4px; padding:16px;">
      <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px;">
        <label style="font-size:13px; display:flex; align-items:center; gap:4px;"><input type="checkbox" class="ps-script" value="all" checked> Alles</label>
        <label style="font-size:13px; display:flex; align-items:center; gap:4px;"><input type="checkbox" class="ps-script-item" value="users"> Users</label>
        <label style="font-size:13px; display:flex; align-items:center; gap:4px;"><input type="checkbox" class="ps-script-item" value="groups"> Groups</label>
        <label style="font-size:13px; display:flex; align-items:center; gap:4px;"><input type="checkbox" class="ps-script-item" value="memberships"> Memberships</label>
        <label style="font-size:13px; display:flex; align-items:center; gap:4px;"><input type="checkbox" class="ps-script-item" value="ous"> OUs</label>
        <label style="font-size:13px; display:flex; align-items:center; gap:4px;"><input type="checkbox" class="ps-script-item" value="serviceaccounts"> Service Accounts</label>
      </div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
        <div>
          <label style="display:block; font-size:12px; color:#858585; margin-bottom:2px;">MaxResults (0 = onbeperkt)</label>
          <input type="number" id="psMaxResults" class="cfg-input" value="0" min="0" style="width:120px;">
        </div>
        <div>
          <label style="display:block; font-size:12px; color:#858585; margin-bottom:2px;">SearchBase (optioneel)</label>
          <input type="text" id="psSearchBase" class="cfg-input" placeholder="OU=Users,DC=domain,DC=local" style="width:350px;">
        </div>
      </div>
      <button onclick="runPowerShell()" class="pipeline-btn" id="psRunBtn"><span class="btn-step">PS</span> Export uitvoeren</button>
      <div id="psOutput" style="display:none; margin-top:12px; background:#1e1e1e; border:1px solid #3c3c3c; border-radius:4px; padding:10px; font-family:'Consolas','Courier New',monospace; font-size:12px; max-height:400px; overflow-y:auto; white-space:pre-wrap; color:#cccccc;"></div>
    </div>

    <h2>Of: CSV-bestanden handmatig uploaden</h2>
    <p style="color:#858585">Upload CSV-bestanden die je eerder hebt geexporteerd (users.csv, groups.csv, memberships.csv, ous.csv, service-accounts.csv).</p>
    <form id="uploadForm" style="margin: 16px 0;">
      <input type="file" id="csvFiles" multiple accept=".csv" style="color:#cccccc; margin-bottom:8px;">
      <br>
      <button type="submit" style="background:#0e639c; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px; margin-top:8px;">Upload & Importeer</button>
    </form>
    <div id="uploadResult" style="margin-top:8px;"></div>`;

  if (existingFiles.length > 0) {
    body += `<h3>Bestanden in data/imports/</h3>
      <ul style="list-style:none;padding:0">`;
    for (const f of existingFiles) {
      body += `<li style="padding:2px 0;font-size:13px">📄 ${f}</li>`;
    }
    body += `</ul>`;
  }

  if (lastImport) {
    body += `<h3>Laatste import</h3>
      <table>
        <tr><td style="width:180px;color:#858585">Datum</td><td>${lastImport.imported_at}</td></tr>
        <tr><td style="color:#858585">Users</td><td>${lastImport.user_count}</td></tr>
        <tr><td style="color:#858585">Groepen</td><td>${lastImport.group_count}</td></tr>
        <tr><td style="color:#858585">Lidmaatschappen</td><td>${lastImport.membership_count}</td></tr>
        <tr><td style="color:#858585">OUs</td><td>${lastImport.ou_count}</td></tr>
        <tr><td style="color:#858585">Service accounts</td><td>${lastImport.service_account_count}</td></tr>
      </table>`;
  }

  body += `
    <style>
      .cfg-input { background:#3c3c3c; border:1px solid #555; color:#cccccc; padding:4px 8px; font-size:13px; border-radius:3px; font-family:inherit; }
      .cfg-input:focus { outline:none; border-color:#007acc; }
    </style>

    <script>
      // Toggle all/individual checkboxes
      document.querySelector('.ps-script[value="all"]').addEventListener('change', function() {
        document.querySelectorAll('.ps-script-item').forEach(cb => { cb.checked = false; cb.disabled = this.checked; });
      });
      document.querySelectorAll('.ps-script-item').forEach(cb => {
        cb.addEventListener('change', function() {
          const allCb = document.querySelector('.ps-script[value="all"]');
          if (this.checked) allCb.checked = false;
        });
      });

      async function runPowerShell() {
        const allChecked = document.querySelector('.ps-script[value="all"]').checked;
        let scripts = [];
        if (allChecked) {
          scripts = ['all'];
        } else {
          document.querySelectorAll('.ps-script-item:checked').forEach(cb => scripts.push(cb.value));
        }
        if (scripts.length === 0) { alert('Selecteer minimaal een script.'); return; }

        const maxResults = parseInt(document.getElementById('psMaxResults').value) || 0;
        const searchBase = document.getElementById('psSearchBase').value.trim();

        const btn = document.getElementById('psRunBtn');
        const output = document.getElementById('psOutput');
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-step">PS</span> Bezig...';
        output.style.display = 'block';
        output.textContent = 'PowerShell wordt gestart...\\n';

        try {
          const res = await fetch('/api/run-powershell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scripts, maxResults, searchBase }),
          });
          const data = await res.json();
          if (data.success) {
            output.textContent += data.output || '';
            output.textContent += '\\n=== Export compleet ===\\n';
            output.style.color = '#89d185';
            // Auto-trigger import
            output.textContent += '\\nCSV-bestanden importeren...\\n';
            try {
              const importRes = await fetch('/api/run/import-from-ps', { method: 'POST' });
              const importData = await importRes.json();
              if (importData.success) {
                output.textContent += importData.message + '\\n';
                setTimeout(() => location.reload(), 1500);
              } else {
                output.textContent += 'Import fout: ' + (importData.error || 'onbekend') + '\\n';
              }
            } catch (importErr) {
              output.textContent += 'Import fout: ' + importErr.message + '\\n';
            }
          } else {
            output.textContent += (data.output || '') + '\\n';
            output.textContent += 'FOUT: ' + (data.error || 'Onbekende fout') + '\\n';
            output.style.color = '#f44747';
          }
        } catch (err) {
          output.textContent += 'Fout: ' + err.message + '\\n';
          output.style.color = '#f44747';
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<span class="btn-step">PS</span> Export uitvoeren';
        }
      }
    </script>

    <h2>Pipeline</h2>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin:8px 0;">
      <button onclick="runAction('analyze')" class="pipeline-btn"><span class="btn-step">2</span> Analyse uitvoeren</button>
      <button onclick="runAction('rbac')" class="pipeline-btn"><span class="btn-step">3</span> RBAC genereren</button>
      <button onclick="runAction('simulate')" class="pipeline-btn"><span class="btn-step">4</span> IST/SOLL simulatie</button>
      <button onclick="runAction('entra')" class="pipeline-btn"><span class="btn-step">5</span> Entra ID check</button>
    </div>
    <style>
      .pipeline-btn { background:#0e639c; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px; display:inline-flex; align-items:center; gap:6px; }
      .pipeline-btn:hover { background:#1177bb; }
      .btn-step { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:rgba(255,255,255,0.2); font-size:11px; font-weight:700; }
    </style>
    <div id="actionResult" style="margin-top:8px;"></div>

    <h2 style="margin-top:32px;">Database beheer</h2>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin:8px 0;">
      <button onclick="if(confirm('Analyse-data wissen? Import-data blijft behouden.')) runAction('clear-analysis')" style="background:#5a5a5a; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px;">Analyse wissen</button>
      <button onclick="if(confirm('ALLE data wissen? Database wordt volledig leeggemaakt.')) runAction('clear-all')" style="background:#f44747; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px;">Database legen</button>
    </div>

    <script>
      document.getElementById('uploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const files = document.getElementById('csvFiles').files;
        if (files.length === 0) return;
        const formData = new FormData();
        for (const f of files) formData.append('files', f);
        const resultDiv = document.getElementById('uploadResult');
        resultDiv.innerHTML = '<span style="color:#4fc1ff">Uploaden en importeren...</span>';
        try {
          const res = await fetch('/api/import', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.success) {
            resultDiv.innerHTML = '<span style="color:#89d185">' + data.message + '</span>';
            setTimeout(() => location.reload(), 1500);
          } else {
            resultDiv.innerHTML = '<span style="color:#f44747">' + (data.error || 'Fout') + '</span>';
          }
        } catch (err) {
          resultDiv.innerHTML = '<span style="color:#f44747">Fout: ' + err.message + '</span>';
        }
      });

      async function runAction(action) {
        const resultDiv = document.getElementById('actionResult');
        resultDiv.innerHTML = '<span style="color:#4fc1ff">Bezig...</span>';
        try {
          const res = await fetch('/api/run/' + action, { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            resultDiv.innerHTML = '<span style="color:#89d185">' + data.message + '</span>';
            setTimeout(() => location.reload(), 1000);
          } else {
            resultDiv.innerHTML = '<span style="color:#f44747">' + (data.error || 'Fout') + '</span>';
          }
        } catch (err) {
          resultDiv.innerHTML = '<span style="color:#f44747">Fout: ' + err.message + '</span>';
        }
      }
    </script>`;

  return renderLayout('Import & Beheer', body, 'dashboard');
}

function renderExportPage() {
  // List existing reports
  const reports = [];
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('AD-Gezondheidsrapport') && f.endsWith('.docx'));
    for (const f of files) {
      const stat = fs.statSync(path.join(DATA_DIR, f));
      reports.push({ name: f, size: (stat.size / 1024).toFixed(0), date: stat.mtime.toLocaleDateString('nl-NL') });
    }
    reports.sort((a, b) => b.name.localeCompare(a.name));
  } catch {}

  let reportsHtml = '';
  if (reports.length > 0) {
    reportsHtml = `<h2>Gegenereerde rapporten</h2><table>
      <tr><th>Bestand</th><th>Grootte</th><th>Datum</th><th></th></tr>`;
    for (const r of reports) {
      reportsHtml += `<tr>
        <td>${r.name}</td>
        <td>${r.size} KB</td>
        <td>${r.date}</td>
        <td><a href="/download/${r.name}" style="background:#1B7840; color:white; padding:3px 10px; border-radius:3px; text-decoration:none; font-size:12px;">Download</a></td>
      </tr>`;
    }
    reportsHtml += '</table>';
  }

  const body = `
    <h1>Rapport genereren</h1>
    <p style="color:#858585">Genereer een Word-document (DOCX) met de volledige IST-analyse, NEN7510-compliance mapping en handelingsperspectief. Geschikt voor directie en MT.</p>

    <h2>Instellingen</h2>
    <div style="margin: 16px 0;">
      <label style="display:block; margin-bottom:4px; font-size:13px; color:#858585;">Organisatienaam</label>
      <input type="text" id="orgName" placeholder="Naam van de organisatie" value="" style="background:#3c3c3c; border:1px solid #555; color:#cccccc; padding:6px 12px; font-size:13px; border-radius:3px; width:350px;">
    </div>

    <div style="margin: 16px 0;">
      <button onclick="generateReport()" class="pipeline-btn"><span class="btn-step">6</span> Rapport genereren (DOCX)</button>
    </div>
    <div id="exportResult" style="margin-top:8px;"></div>
    <style>
      .pipeline-btn { background:#0e639c; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px; display:inline-flex; align-items:center; gap:6px; }
      .pipeline-btn:hover { background:#1177bb; }
      .btn-step { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:rgba(255,255,255,0.2); font-size:11px; font-weight:700; }
    </style>

    ${reportsHtml}

    <h2 style="margin-top:24px;">Rapportinhoud</h2>
    <table>
      <tr><th>Hoofdstuk</th><th>Inhoud</th></tr>
      <tr><td>Management samenvatting</td><td>Volwassenheidsscore, kerncijfers, belangrijkste conclusies</td></tr>
      <tr><td>Huidige situatie (IST)</td><td>Alle bevindingen per thema met NEN7510-referenties</td></tr>
      <tr><td>NEN7510 Compliance</td><td>Mapping per normclausule, AVG-impact</td></tr>
      <tr><td>Entra ID Migratie</td><td>Blokkers en aandachtspunten voor cloudtransitie</td></tr>
      <tr><td>Gewenste situatie (SOLL)</td><td>RBAC-model, AGDLP-structuur, IST vs SOLL vergelijking</td></tr>
      <tr><td>Handelingsperspectief</td><td>Gefaseerd actieplan (30 dagen / 3 mnd / 6 mnd / 12 mnd)</td></tr>
      <tr><td>Volgende stappen</td><td>Concrete actiepunten met verantwoordelijken</td></tr>
    </table>

    <script>
      async function generateReport() {
        const orgName = document.getElementById('orgName').value.trim();
        if (!orgName) {
          document.getElementById('exportResult').innerHTML = '<span style="color:#f44747">Vul een organisatienaam in.</span>';
          return;
        }
        const resultDiv = document.getElementById('exportResult');
        resultDiv.innerHTML = '<span style="color:#4fc1ff">Rapport wordt gegenereerd...</span>';
        try {
          const res = await fetch('/api/run/export-docx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgName }),
          });
          const data = await res.json();
          if (data.success) {
            resultDiv.innerHTML = '<span style="color:#89d185">' + data.message + '</span>' +
              (data.filename ? ' <a href="/download/' + data.filename + '" style="margin-left:8px; background:#1B7840; color:white; padding:3px 10px; border-radius:3px; text-decoration:none; font-size:12px;">Download</a>' : '');
            setTimeout(() => location.reload(), 2000);
          } else {
            resultDiv.innerHTML = '<span style="color:#f44747">' + (data.error || 'Fout') + '</span>';
          }
        } catch (err) {
          resultDiv.innerHTML = '<span style="color:#f44747">Fout: ' + err.message + '</span>';
        }
      }
    </script>`;

  return renderLayout('Rapport', body, 'export');
}

const server = http.createServer(async (req, res) => {
  const { pathname, query } = parseQuery(req.url);

  try {
    // API routes
    if (req.method === 'POST' && pathname === '/api/import') {
      await handleImportUpload(req, res);
      return;
    }

    if (req.method === 'POST' && pathname.startsWith('/api/run/')) {
      const action = pathname.replace('/api/run/', '');
      if (action === 'export-docx') {
        const formData = await parseFormData(req);
        const orgName = formData.orgName || 'Organisatie';
        res._exportOrgName = orgName;
      }
      handleRunAction(action, res);
      return;
    }

    // Design config API
    if (req.method === 'POST' && pathname === '/api/config/design') {
      const data = await parseFormData(req);
      try {
        pageConfig.saveConfig(data);
        sendJson(res, { success: true, message: 'Configuratie opgeslagen.' });
      } catch (err) {
        sendJson(res, { error: err.message }, 500);
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/config/design/reset') {
      try {
        pageConfig.saveConfig(pageConfig.DEFAULT_CONFIG);
        sendJson(res, { success: true, message: 'Standaardwaarden hersteld.' });
      } catch (err) {
        sendJson(res, { error: err.message }, 500);
      }
      return;
    }

    // Persona config APIs
    if (req.method === 'POST' && pathname === '/api/config/personas/mappings') {
      const data = await parseFormData(req);
      try {
        const config = pagePersonas.loadPersonaConfig();
        if (data.merge) {
          Object.assign(config.mappings, data.mappings || {});
        } else {
          config.mappings = data.mappings || {};
        }
        pagePersonas.savePersonaConfig(config);
        sendJson(res, { success: true, message: `${Object.keys(data.mappings || {}).length} mappings opgeslagen.` });
      } catch (err) {
        sendJson(res, { error: err.message }, 500);
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/config/personas/definitions') {
      const data = await parseFormData(req);
      try {
        const config = pagePersonas.loadPersonaConfig();
        config.personas = data.personas || [];
        pagePersonas.savePersonaConfig(config);
        sendJson(res, { success: true, message: `${config.personas.length} persona's opgeslagen.` });
      } catch (err) {
        sendJson(res, { error: err.message }, 500);
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/personas/classify') {
      const data = await parseFormData(req);
      try {
        const { classifyTitles } = require('./llm-client');
        const config = pagePersonas.loadPersonaConfig();
        const db = getDatabase();
        const rows = db.prepare("SELECT Title as title FROM users WHERE Title IS NOT NULL AND Title != '' GROUP BY Title").all();
        const unmapped = rows.map(r => r.title).filter(t => !config.mappings[t]);
        if (unmapped.length === 0) {
          sendJson(res, { results: [], message: 'Alle titels zijn al gekoppeld.' });
          return;
        }
        const results = await classifyTitles({
          provider: data.provider,
          apiKey: data.apiKey,
          titles: unmapped,
          personas: config.personas,
        });
        sendJson(res, { success: true, results });
      } catch (err) {
        sendJson(res, { error: err.message }, 500);
      }
      return;
    }

    // PowerShell runner API
    if (req.method === 'POST' && pathname === '/api/run-powershell') {
      const data = await parseFormData(req);
      try {
        const { execFile } = require('child_process');
        const scriptsDir = path.join(__dirname, '..', 'scripts');
        const importDir = path.join(DATA_DIR, 'imports');
        fs.mkdirSync(importDir, { recursive: true });

        const scripts = data.scripts || ['all'];
        const maxResults = parseInt(data.maxResults) || 0;
        const searchBase = data.searchBase || '';

        let scriptFile;
        let args = ['-ExecutionPolicy', 'Bypass', '-File'];

        if (scripts.includes('all')) {
          scriptFile = path.join(scriptsDir, 'Export-All.ps1');
        } else {
          // Run individual scripts sequentially via Export-All.ps1
          scriptFile = path.join(scriptsDir, 'Export-All.ps1');
        }

        args.push(scriptFile);
        args.push('-OutputPath', importDir);
        if (maxResults > 0) args.push('-MaxResults', String(maxResults));
        if (searchBase) args.push('-SearchBase', searchBase);

        const result = await new Promise((resolve, reject) => {
          execFile('powershell.exe', args, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err && err.killed) {
              reject(new Error('Timeout: script duurde langer dan 5 minuten.'));
              return;
            }
            resolve({ code: err ? err.code : 0, stdout, stderr, error: err });
          });
        });

        const output = (result.stdout || '') + (result.stderr ? '\n[STDERR] ' + result.stderr : '');
        if (result.code !== 0 && result.code !== null) {
          sendJson(res, { success: false, error: 'Script afgesloten met code ' + result.code, output });
        } else {
          sendJson(res, { success: true, output });
        }
      } catch (err) {
        sendJson(res, { error: err.message }, 500);
      }
      return;
    }

    // Download route for generated reports
    if (req.method === 'GET' && pathname.startsWith('/download/')) {
      const filename = path.basename(pathname.replace('/download/', ''));
      if (!filename.endsWith('.docx')) {
        sendJson(res, { error: 'Ongeldig bestandstype' }, 400);
        return;
      }
      const filePath = path.join(DATA_DIR, filename);
      if (!fs.existsSync(filePath)) {
        sendJson(res, { error: 'Bestand niet gevonden' }, 404);
        return;
      }
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': stat.size,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Page routes
    let html;
    switch (pathname) {
      case '/':
      case '/dashboard':
        html = pageDashboard.render();
        break;
      case '/import':
        html = renderImportPage();
        break;
      case '/groups':
        html = pageGroups.render(query);
        break;
      case '/groups/detail':
        html = pageGroups.renderDetail(query);
        break;
      case '/users':
        html = pageUsers.render(query);
        break;
      case '/users/detail':
        html = pageUsers.renderDetail(query);
        break;
      case '/problems':
        html = pageProblems.render(query);
        break;
      case '/rbac':
        html = pageRbac.render(query);
        break;
      case '/rbac/detail':
        html = pageRbac.renderDetail(query);
        break;
      case '/rbac/bundle':
        html = pageRbac.renderBundle(query);
        break;
      case '/rbac/agdlp':
        html = pageRbac.renderAGDLP();
        break;
      case '/simulator':
        html = pageSimulator.render(query);
        break;
      case '/simulator/detail':
        html = pageSimulator.renderDetail(query);
        break;
      case '/entra':
        html = pageEntra.render();
        break;
      case '/conformity':
        html = pageConformity.render();
        break;
      case '/config':
        html = pageConfig.render();
        break;
      case '/personas':
        html = pagePersonas.render();
        break;
      case '/help':
        html = pageHelp.render();
        break;
      case '/export':
        html = renderExportPage();
        break;
      default:
        sendHtml(res, renderLayout('404', '<h1>Pagina niet gevonden</h1>', 'dashboard'), 404);
        return;
    }

    sendHtml(res, html);
  } catch (err) {
    console.error('Error:', err);
    sendHtml(res, renderLayout('Fout', `<h1>Fout</h1><pre>${err.message}</pre>`, 'dashboard'), 500);
  }
});

async function main() {
  const { initEngine } = require('./database');
  await initEngine();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPoort ${PORT} is al in gebruik.`);
      console.error('Sluit eerst de andere instantie of kies een andere poort.');
      console.error(`Probeer: set PORT=3601 && adcleaner.exe\n`);
      if (process.platform === 'win32') {
        const { exec } = require('child_process');
        exec(`powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Poort ${PORT} is al in gebruik. Sluit eerst de andere instantie van AD Opschonen.','AD Opschonen - Fout','OK','Error')"`);
      }
      setTimeout(() => process.exit(1), 5000);
    } else {
      console.error('Server fout:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`AD Opschonen viewer: http://localhost:${PORT}`);
    console.log(`Import:              http://localhost:${PORT}/import`);

    // Auto-open browser on Windows
    if (process.platform === 'win32') {
      const { exec } = require('child_process');
      exec(`start http://localhost:${PORT}`);
    }
  });
}

main().catch(err => {
  console.error('Fout bij starten:', err);
  process.exit(1);
});
