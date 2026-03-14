const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { getDatabase, clearImportData, clearAnalysisData, DATA_DIR } = require('./database');

const PORT = 3600;

const pageDashboard = require('./views/page-dashboard');
const pageGroups = require('./views/page-groups');
const pageUsers = require('./views/page-users');
const pageProblems = require('./views/page-problems');
const pageRbac = require('./views/page-rbac');
const pageSimulator = require('./views/page-simulator');
const pageEntra = require('./views/page-entra');

function parseQuery(urlStr) {
  const parsed = url.parse(urlStr, true);
  return { pathname: parsed.pathname, query: parsed.query || {} };
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

function handleRunAction(action, res) {
  try {
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
    } else if (action === 'clear-analysis') {
      const db = getDatabase();
      clearAnalysisData(db);
      db.close();
      sendJson(res, { success: true, message: 'Analyse-data gewist. Import-data behouden.' });
    } else if (action === 'clear-all') {
      const db = getDatabase();
      clearImportData(db);
      db.close();
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
  db.close();

  let body = `
    <h1>Import & Beheer</h1>

    <h2>CSV-bestanden uploaden</h2>
    <p style="color:#858585">Upload de CSV-bestanden die je met de PowerShell scripts hebt geexporteerd.</p>
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
    <h2>Acties</h2>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin:8px 0;">
      <button onclick="runAction('analyze')" style="background:#0e639c; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px;">Analyse uitvoeren</button>
      <button onclick="runAction('rbac')" style="background:#0e639c; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px;">RBAC genereren</button>
      <button onclick="runAction('simulate')" style="background:#0e639c; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px;">IST/SOLL simulatie</button>
      <button onclick="runAction('entra')" style="background:#0e639c; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px;">Entra ID check</button>
    </div>
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
      handleRunAction(action, res);
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

server.listen(PORT, () => {
  console.log(`AD Opschonen viewer: http://localhost:${PORT}`);
  console.log(`Import:              http://localhost:${PORT}/import`);
});
