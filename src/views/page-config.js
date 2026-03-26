const fs = require('fs');
const path = require('path');
const { renderLayout, escapeHtml } = require('./layout');
const { DATA_DIR } = require('../database');

const CONFIG_PATH = path.join(DATA_DIR, 'design-config.json');

const DEFAULT_CONFIG = {
  prefixes: [
    { prefix: 'FGA ', type: 'container', description: 'Functiegroep Afdeling (breed)' },
    { prefix: 'afdl-', type: 'container', description: 'Afdelingsgroepen' },
    { prefix: 'affu-', type: 'container', description: 'Afdelingsfunctiegroepen' },
    { prefix: 'plus-', type: 'container', description: 'Plus-groepen (meerdere afdelingen)' },
    { prefix: 'ctxr-', type: 'container', description: 'Citrix-resourcegroepen' },
    { prefix: 'appl-', type: 'resource', description: 'Applicatiegroepen' },
    { prefix: 'drvm-', type: 'resource', description: 'Schijfmappinggroepen' },
    { prefix: 'ntfs-', type: 'resource', description: 'NTFS-permissiegroepen' },
    { prefix: 'mail-', type: 'resource', description: 'Mailgroepen / distributielijsten' },
  ],
  nestingRules: [
    { from: 'container', to: 'resource', allowed: true, description: 'Container mag resource bevatten' },
    { from: 'container', to: 'container', allowed: true, description: 'Container mag subcontainer bevatten' },
    { from: 'resource', to: 'resource', allowed: false, description: 'Resource mag GEEN resource bevatten' },
    { from: 'resource', to: 'container', allowed: false, description: 'Resource mag GEEN container bevatten' },
  ],
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading design config:', err.message);
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function render() {
  const config = loadConfig();

  let prefixRows = '';
  for (let i = 0; i < config.prefixes.length; i++) {
    const p = config.prefixes[i];
    prefixRows += `<tr data-idx="${i}">
      <td><input type="text" class="cfg-input prefix-val" value="${escapeHtml(p.prefix)}" style="width:100px;"></td>
      <td><select class="cfg-select prefix-type">
        <option value="container"${p.type === 'container' ? ' selected' : ''}>Container</option>
        <option value="resource"${p.type === 'resource' ? ' selected' : ''}>Resource</option>
      </select></td>
      <td><input type="text" class="cfg-input prefix-desc" value="${escapeHtml(p.description)}" style="width:100%;"></td>
      <td><button class="btn-icon btn-delete-prefix" title="Verwijderen">&times;</button></td>
    </tr>`;
  }

  let nestingRows = '';
  for (let i = 0; i < config.nestingRules.length; i++) {
    const r = config.nestingRules[i];
    nestingRows += `<tr data-idx="${i}">
      <td><select class="cfg-select nesting-from">
        <option value="container"${r.from === 'container' ? ' selected' : ''}>Container</option>
        <option value="resource"${r.from === 'resource' ? ' selected' : ''}>Resource</option>
      </select></td>
      <td><select class="cfg-select nesting-to">
        <option value="container"${r.to === 'container' ? ' selected' : ''}>Container</option>
        <option value="resource"${r.to === 'resource' ? ' selected' : ''}>Resource</option>
      </select></td>
      <td><select class="cfg-select nesting-allowed">
        <option value="true"${r.allowed ? ' selected' : ''}>Toegestaan</option>
        <option value="false"${!r.allowed ? ' selected' : ''}>Verboden</option>
      </select></td>
      <td><input type="text" class="cfg-input nesting-desc" value="${escapeHtml(r.description)}" style="width:100%;"></td>
      <td><button class="btn-icon btn-delete-nesting" title="Verwijderen">&times;</button></td>
    </tr>`;
  }

  const body = `
    <h1>Groepsontwerp configuratie</h1>
    <p style="color:#858585;">Definieer de naamconventie (prefixen) en nestingregels voor het AD-groepsontwerp. Deze configuratie wordt gebruikt door de ontwerp-check en RBAC-engine.</p>

    <h2>Prefix-configuratie</h2>
    <table id="prefixTable">
      <thead>
        <tr><th style="width:120px;">Prefix</th><th style="width:120px;">Type</th><th>Omschrijving</th><th style="width:40px;"></th></tr>
      </thead>
      <tbody>
        ${prefixRows}
      </tbody>
    </table>
    <div style="display:flex; gap:8px; margin-bottom:24px;">
      <button onclick="addPrefix()" class="btn-action">+ Prefix toevoegen</button>
    </div>

    <h2>Nesting-regels</h2>
    <p style="color:#858585; font-size:13px;">Bepaal welke groepstypes in welke andere types genest mogen worden.</p>
    <table id="nestingTable">
      <thead>
        <tr><th style="width:120px;">Van (parent)</th><th style="width:120px;">Naar (child)</th><th style="width:120px;">Status</th><th>Toelichting</th><th style="width:40px;"></th></tr>
      </thead>
      <tbody>
        ${nestingRows}
      </tbody>
    </table>
    <div style="display:flex; gap:8px; margin-bottom:24px;">
      <button onclick="addNesting()" class="btn-action">+ Regel toevoegen</button>
    </div>

    <div style="display:flex; gap:8px; margin-top:24px; padding-top:16px; border-top:1px solid #3c3c3c;">
      <button onclick="saveConfig()" class="btn-primary">Opslaan</button>
      <button onclick="resetDefaults()" class="btn-secondary">Standaardwaarden herstellen</button>
    </div>
    <div id="saveResult" style="margin-top:8px;"></div>

    <style>
      .cfg-input { background:#3c3c3c; border:1px solid #555; color:#cccccc; padding:4px 8px; font-size:13px; border-radius:3px; font-family:inherit; }
      .cfg-input:focus { outline:none; border-color:#007acc; }
      .cfg-select { background:#3c3c3c; border:1px solid #555; color:#cccccc; padding:4px 8px; font-size:13px; border-radius:3px; font-family:inherit; }
      .cfg-select:focus { outline:none; border-color:#007acc; }
      .btn-action { background:#0e639c; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px; font-size:13px; font-family:inherit; }
      .btn-action:hover { background:#1177bb; }
      .btn-primary { background:#0e639c; color:white; border:none; padding:8px 24px; cursor:pointer; border-radius:3px; font-size:13px; font-weight:600; font-family:inherit; }
      .btn-primary:hover { background:#1177bb; }
      .btn-secondary { background:#3c3c3c; color:#cccccc; border:1px solid #555; padding:8px 24px; cursor:pointer; border-radius:3px; font-size:13px; font-family:inherit; }
      .btn-secondary:hover { background:#4a4a4a; }
      .btn-icon { background:none; border:none; color:#f44747; cursor:pointer; font-size:18px; padding:2px 6px; border-radius:3px; }
      .btn-icon:hover { background:#3c3c3c; }
    </style>

    <script>
      function addPrefix() {
        const tbody = document.querySelector('#prefixTable tbody');
        const idx = tbody.children.length;
        const tr = document.createElement('tr');
        tr.setAttribute('data-idx', idx);
        tr.innerHTML = \`
          <td><input type="text" class="cfg-input prefix-val" value="" style="width:100px;" placeholder="bijv. app-"></td>
          <td><select class="cfg-select prefix-type">
            <option value="container">Container</option>
            <option value="resource" selected>Resource</option>
          </select></td>
          <td><input type="text" class="cfg-input prefix-desc" value="" style="width:100%;" placeholder="Omschrijving"></td>
          <td><button class="btn-icon btn-delete-prefix" title="Verwijderen">&times;</button></td>
        \`;
        tbody.appendChild(tr);
        bindDeleteButtons();
      }

      function addNesting() {
        const tbody = document.querySelector('#nestingTable tbody');
        const idx = tbody.children.length;
        const tr = document.createElement('tr');
        tr.setAttribute('data-idx', idx);
        tr.innerHTML = \`
          <td><select class="cfg-select nesting-from">
            <option value="container">Container</option>
            <option value="resource">Resource</option>
          </select></td>
          <td><select class="cfg-select nesting-to">
            <option value="container">Container</option>
            <option value="resource">Resource</option>
          </select></td>
          <td><select class="cfg-select nesting-allowed">
            <option value="true">Toegestaan</option>
            <option value="false">Verboden</option>
          </select></td>
          <td><input type="text" class="cfg-input nesting-desc" value="" style="width:100%;" placeholder="Toelichting"></td>
          <td><button class="btn-icon btn-delete-nesting" title="Verwijderen">&times;</button></td>
        \`;
        tbody.appendChild(tr);
        bindDeleteButtons();
      }

      function bindDeleteButtons() {
        document.querySelectorAll('.btn-delete-prefix').forEach(btn => {
          btn.onclick = function() { this.closest('tr').remove(); };
        });
        document.querySelectorAll('.btn-delete-nesting').forEach(btn => {
          btn.onclick = function() { this.closest('tr').remove(); };
        });
      }

      function collectConfig() {
        const prefixes = [];
        document.querySelectorAll('#prefixTable tbody tr').forEach(tr => {
          const prefix = tr.querySelector('.prefix-val').value.trim();
          const type = tr.querySelector('.prefix-type').value;
          const description = tr.querySelector('.prefix-desc').value.trim();
          if (prefix) prefixes.push({ prefix, type, description });
        });

        const nestingRules = [];
        document.querySelectorAll('#nestingTable tbody tr').forEach(tr => {
          const from = tr.querySelector('.nesting-from').value;
          const to = tr.querySelector('.nesting-to').value;
          const allowed = tr.querySelector('.nesting-allowed').value === 'true';
          const description = tr.querySelector('.nesting-desc').value.trim();
          nestingRules.push({ from, to, allowed, description });
        });

        return { prefixes, nestingRules };
      }

      async function saveConfig() {
        const config = collectConfig();
        const resultDiv = document.getElementById('saveResult');
        resultDiv.innerHTML = '<span style="color:#4fc1ff">Opslaan...</span>';
        try {
          const res = await fetch('/api/config/design', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          });
          const data = await res.json();
          if (data.success) {
            resultDiv.innerHTML = '<span style="color:#89d185">' + data.message + '</span>';
          } else {
            resultDiv.innerHTML = '<span style="color:#f44747">' + (data.error || 'Fout bij opslaan') + '</span>';
          }
        } catch (err) {
          resultDiv.innerHTML = '<span style="color:#f44747">Fout: ' + err.message + '</span>';
        }
      }

      async function resetDefaults() {
        if (!confirm('Standaardwaarden herstellen? Huidige configuratie wordt overschreven.')) return;
        const resultDiv = document.getElementById('saveResult');
        resultDiv.innerHTML = '<span style="color:#4fc1ff">Herstellen...</span>';
        try {
          const res = await fetch('/api/config/design/reset', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            resultDiv.innerHTML = '<span style="color:#89d185">' + data.message + '</span>';
            setTimeout(() => location.reload(), 500);
          } else {
            resultDiv.innerHTML = '<span style="color:#f44747">' + (data.error || 'Fout') + '</span>';
          }
        } catch (err) {
          resultDiv.innerHTML = '<span style="color:#f44747">Fout: ' + err.message + '</span>';
        }
      }

      // Bind delete buttons on load
      bindDeleteButtons();
    </script>`;

  return renderLayout('Groepsontwerp configuratie', body, 'config');
}

module.exports = { render, loadConfig, saveConfig, DEFAULT_CONFIG, CONFIG_PATH };
