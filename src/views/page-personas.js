const fs = require('fs');
const path = require('path');
const { renderLayout, escapeHtml } = require('./layout');
const { getDatabase, DATA_DIR } = require('../database');

const PERSONA_CONFIG_PATH = path.join(DATA_DIR, 'persona-config.json');

const DEFAULT_PERSONAS = [
  'Medisch specialist/Arts',
  'Verpleegkundige',
  'Leidinggevende zorg',
  'Medisch secretariaat',
  'Medische ondersteuning',
  'Bedrijfsvoering',
  'Niet-medische ondersteuning',
  'Externe medewerker',
  'Technisch account',
  'Onbekend',
];

function loadPersonaConfig() {
  try {
    if (fs.existsSync(PERSONA_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(PERSONA_CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading persona config:', err.message);
  }
  return { personas: DEFAULT_PERSONAS, mappings: {} };
}

function savePersonaConfig(config) {
  fs.mkdirSync(path.dirname(PERSONA_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(PERSONA_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function getJobTitles() {
  try {
    const db = getDatabase();
    const rows = db.prepare("SELECT Title as title, COUNT(*) as count FROM users WHERE Title IS NOT NULL AND Title != '' GROUP BY Title ORDER BY count DESC").all();
    return rows;
  } catch {
    return [];
  }
}

function render() {
  const config = loadPersonaConfig();
  const titles = getJobTitles();
  const totalTitles = titles.length;
  const mappedCount = titles.filter(t => config.mappings[t.title]).length;

  let titleRows = '';
  for (const t of titles) {
    const currentPersona = config.mappings[t.title] || '';
    let options = '<option value="">-- Kies persona --</option>';
    for (const p of config.personas) {
      options += `<option value="${escapeHtml(p)}"${currentPersona === p ? ' selected' : ''}>${escapeHtml(p)}</option>`;
    }
    titleRows += `<tr>
      <td>${escapeHtml(t.title)}</td>
      <td style="text-align:right;">${t.count}</td>
      <td><select class="cfg-select title-persona" data-title="${escapeHtml(t.title)}">${options}</select></td>
    </tr>`;
  }

  let personaListHtml = '';
  for (let i = 0; i < config.personas.length; i++) {
    personaListHtml += `<div class="persona-item" style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
      <input type="text" class="cfg-input persona-name" value="${escapeHtml(config.personas[i])}" style="flex:1;">
      <button class="btn-icon btn-delete-persona" title="Verwijderen">&times;</button>
    </div>`;
  }

  const body = `
    <h1>Persona-configuratie</h1>
    <p style="color:#858585;">Koppel functietitels uit Active Directory aan persona-profielen. Dit wordt gebruikt voor de RBAC-analyse en rapportage.</p>

    <div class="kpi-grid" style="margin-bottom:20px;">
      <div class="kpi-card"><div class="label">Unieke functietitels</div><div class="value">${totalTitles}</div></div>
      <div class="kpi-card"><div class="label">Gekoppeld</div><div class="value good">${mappedCount}</div></div>
      <div class="kpi-card"><div class="label">Niet gekoppeld</div><div class="value${totalTitles - mappedCount > 0 ? ' warning' : ''}">${totalTitles - mappedCount}</div></div>
    </div>

    <div class="conf-tabs">
      <button class="conf-tab-btn active" data-tab="handmatig" onclick="showTab('handmatig')">Handmatig toewijzen</button>
      <button class="conf-tab-btn" data-tab="llm" onclick="showTab('llm')">LLM-assistent</button>
      <button class="conf-tab-btn" data-tab="personas" onclick="showTab('personas')">Persona-beheer</button>
    </div>

    <!-- Tab: Handmatig -->
    <div id="tab-handmatig" class="conf-tab-content" style="display:block;">
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:16px; flex-wrap:wrap;">
        <label style="font-size:13px; color:#858585;">Bulk-actie: alle niet-gekoppelde toewijzen aan</label>
        <select id="bulkPersona" class="cfg-select">
          <option value="">-- Kies persona --</option>
          ${config.personas.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
        </select>
        <button onclick="bulkAssign()" class="btn-action">Toepassen</button>
      </div>

      <input type="text" id="titleSearch" class="search-box" placeholder="Zoek functietitel..." style="width:100%; max-width:400px;">

      <table id="titleTable">
        <thead>
          <tr><th>Functietitel</th><th style="width:80px; text-align:right;">Aantal</th><th style="width:220px;">Persona</th></tr>
        </thead>
        <tbody>
          ${titleRows}
        </tbody>
      </table>

      <div style="margin-top:16px;">
        <button onclick="saveMappings()" class="btn-primary">Mappings opslaan</button>
      </div>
      <div id="manualResult" style="margin-top:8px;"></div>
    </div>

    <!-- Tab: LLM -->
    <div id="tab-llm" class="conf-tab-content">
      <div class="card" style="max-width:600px;">
        <h3 style="margin-top:0;">LLM-classificatie</h3>
        <p style="color:#858585; font-size:13px; margin-bottom:12px;">Gebruik een AI-model om functietitels automatisch aan persona's te koppelen. De API-sleutel wordt niet opgeslagen.</p>

        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; color:#858585; margin-bottom:4px;">Provider</label>
          <select id="llmProvider" class="cfg-select" style="width:250px;">
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; color:#858585; margin-bottom:4px;">API-sleutel</label>
          <input type="password" id="llmApiKey" class="cfg-input" style="width:100%;" placeholder="sk-...">
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; color:#858585; margin-bottom:4px;">Te classificeren</label>
          <span style="font-size:13px;">${totalTitles - mappedCount} niet-gekoppelde titels (van ${totalTitles} totaal)</span>
        </div>

        <button onclick="runLlmClassification()" class="btn-primary" id="llmRunBtn">Classificatie genereren</button>
        <div id="llmStatus" style="margin-top:8px;"></div>
      </div>

      <div id="llmResults" style="display:none; margin-top:20px;">
        <h3>Voorgestelde mapping</h3>
        <p style="color:#858585; font-size:13px; margin-bottom:8px;">Controleer de voorstellen en accepteer of wijs af per titel.</p>
        <table id="llmTable">
          <thead>
            <tr><th>Functietitel</th><th style="width:200px;">Voorgestelde persona</th><th style="width:80px;">Zekerheid</th><th style="width:120px;">Actie</th></tr>
          </thead>
          <tbody id="llmTableBody"></tbody>
        </table>
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button onclick="acceptAllLlm()" class="btn-primary">Alles accepteren</button>
          <button onclick="saveAcceptedLlm()" class="btn-action">Geaccepteerde opslaan</button>
        </div>
        <div id="llmSaveResult" style="margin-top:8px;"></div>
      </div>
    </div>

    <!-- Tab: Persona-beheer -->
    <div id="tab-personas" class="conf-tab-content">
      <div class="card" style="max-width:500px;">
        <h3 style="margin-top:0;">Persona-definities</h3>
        <p style="color:#858585; font-size:13px; margin-bottom:12px;">Voeg persona-profielen toe, bewerk of verwijder ze.</p>
        <div id="personaList">
          ${personaListHtml}
        </div>
        <div style="margin-top:8px;">
          <button onclick="addPersona()" class="btn-action">+ Persona toevoegen</button>
        </div>
        <div style="margin-top:16px;">
          <button onclick="savePersonas()" class="btn-primary">Persona's opslaan</button>
        </div>
        <div id="personaResult" style="margin-top:8px;"></div>
      </div>
    </div>

    <style>
      .cfg-input { background:#3c3c3c; border:1px solid #555; color:#cccccc; padding:4px 8px; font-size:13px; border-radius:3px; font-family:inherit; }
      .cfg-input:focus { outline:none; border-color:#007acc; }
      .cfg-select { background:#3c3c3c; border:1px solid #555; color:#cccccc; padding:4px 8px; font-size:13px; border-radius:3px; font-family:inherit; }
      .cfg-select:focus { outline:none; border-color:#007acc; }
      .btn-action { background:#0e639c; color:white; border:none; padding:6px 16px; cursor:pointer; border-radius:3px; font-size:13px; font-family:inherit; }
      .btn-action:hover { background:#1177bb; }
      .btn-primary { background:#0e639c; color:white; border:none; padding:8px 24px; cursor:pointer; border-radius:3px; font-size:13px; font-weight:600; font-family:inherit; }
      .btn-primary:hover { background:#1177bb; }
      .btn-icon { background:none; border:none; color:#f44747; cursor:pointer; font-size:18px; padding:2px 6px; border-radius:3px; }
      .btn-icon:hover { background:#3c3c3c; }
      .conf-tabs { display:flex; gap:0; border-bottom:2px solid #3c3c3c; margin-bottom:20px; }
      .conf-tab-btn { padding:10px 20px; color:#858585; background:none; border:none; border-bottom:2px solid transparent; font-size:13px; cursor:pointer; font-family:inherit; margin-bottom:-2px; }
      .conf-tab-btn:hover { color:#cccccc; background:#2a2d2e; }
      .conf-tab-btn.active { color:#ffffff; border-bottom-color:#4fc1ff; }
      .conf-tab-content { display:none; }
      .card { background:#252526; border:1px solid #3c3c3c; border-radius:4px; padding:16px; margin-bottom:12px; }
      .llm-accept { background:#89d185; color:#1e1e1e; border:none; padding:2px 10px; cursor:pointer; border-radius:3px; font-size:12px; }
      .llm-reject { background:#f44747; color:#1e1e1e; border:none; padding:2px 10px; cursor:pointer; border-radius:3px; font-size:12px; margin-left:4px; }
      .llm-accepted { opacity:0.5; }
      .confidence-high { color:#89d185; }
      .confidence-med { color:#cca700; }
      .confidence-low { color:#f44747; }
    </style>

    <script>
      function showTab(tabId) {
        document.querySelectorAll('.conf-tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.conf-tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById('tab-' + tabId).style.display = 'block';
        document.querySelector('[data-tab="' + tabId + '"]').classList.add('active');
      }

      // Search filter
      document.getElementById('titleSearch').addEventListener('input', function() {
        const q = this.value.toLowerCase();
        document.querySelectorAll('#titleTable tbody tr').forEach(tr => {
          const title = tr.children[0].textContent.toLowerCase();
          tr.style.display = title.includes(q) ? '' : 'none';
        });
      });

      // Bulk assign
      function bulkAssign() {
        const persona = document.getElementById('bulkPersona').value;
        if (!persona) return;
        document.querySelectorAll('#titleTable tbody tr').forEach(tr => {
          const sel = tr.querySelector('.title-persona');
          if (!sel.value) sel.value = persona;
        });
      }

      // Save manual mappings
      async function saveMappings() {
        const mappings = {};
        document.querySelectorAll('.title-persona').forEach(sel => {
          const title = sel.getAttribute('data-title');
          if (sel.value) mappings[title] = sel.value;
        });
        const resultDiv = document.getElementById('manualResult');
        resultDiv.innerHTML = '<span style="color:#4fc1ff">Opslaan...</span>';
        try {
          const res = await fetch('/api/config/personas/mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings }),
          });
          const data = await res.json();
          if (data.success) {
            resultDiv.innerHTML = '<span style="color:#89d185">' + data.message + '</span>';
          } else {
            resultDiv.innerHTML = '<span style="color:#f44747">' + (data.error || 'Fout') + '</span>';
          }
        } catch (err) {
          resultDiv.innerHTML = '<span style="color:#f44747">Fout: ' + err.message + '</span>';
        }
      }

      // Persona management
      function addPersona() {
        const list = document.getElementById('personaList');
        const div = document.createElement('div');
        div.className = 'persona-item';
        div.style = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';
        div.innerHTML = '<input type="text" class="cfg-input persona-name" value="" style="flex:1;" placeholder="Nieuwe persona">' +
          '<button class="btn-icon btn-delete-persona" title="Verwijderen">&times;</button>';
        list.appendChild(div);
        bindPersonaDelete();
      }

      function bindPersonaDelete() {
        document.querySelectorAll('.btn-delete-persona').forEach(btn => {
          btn.onclick = function() { this.closest('.persona-item').remove(); };
        });
      }
      bindPersonaDelete();

      async function savePersonas() {
        const personas = [];
        document.querySelectorAll('.persona-name').forEach(input => {
          const name = input.value.trim();
          if (name) personas.push(name);
        });
        const resultDiv = document.getElementById('personaResult');
        resultDiv.innerHTML = '<span style="color:#4fc1ff">Opslaan...</span>';
        try {
          const res = await fetch('/api/config/personas/definitions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personas }),
          });
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

      // LLM classification
      let llmProposals = [];

      async function runLlmClassification() {
        const provider = document.getElementById('llmProvider').value;
        const apiKey = document.getElementById('llmApiKey').value.trim();
        if (!apiKey) {
          document.getElementById('llmStatus').innerHTML = '<span style="color:#f44747">Voer een API-sleutel in.</span>';
          return;
        }
        const btn = document.getElementById('llmRunBtn');
        btn.disabled = true;
        btn.textContent = 'Bezig met classificeren...';
        document.getElementById('llmStatus').innerHTML = '<span style="color:#4fc1ff">Verzoek wordt verstuurd naar ' + (provider === 'anthropic' ? 'Anthropic' : 'OpenAI') + '...</span>';

        try {
          const res = await fetch('/api/personas/classify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, apiKey }),
          });
          const data = await res.json();
          if (data.error) {
            document.getElementById('llmStatus').innerHTML = '<span style="color:#f44747">' + data.error + '</span>';
            return;
          }
          llmProposals = data.results || [];
          renderLlmResults();
          document.getElementById('llmStatus').innerHTML = '<span style="color:#89d185">' + llmProposals.length + ' titels geclassificeerd.</span>';
          document.getElementById('llmResults').style.display = 'block';
        } catch (err) {
          document.getElementById('llmStatus').innerHTML = '<span style="color:#f44747">Fout: ' + err.message + '</span>';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Classificatie genereren';
        }
      }

      function renderLlmResults() {
        const tbody = document.getElementById('llmTableBody');
        tbody.innerHTML = '';
        for (let i = 0; i < llmProposals.length; i++) {
          const p = llmProposals[i];
          const confClass = p.confidence >= 0.8 ? 'confidence-high' : p.confidence >= 0.5 ? 'confidence-med' : 'confidence-low';
          const tr = document.createElement('tr');
          tr.setAttribute('data-idx', i);
          tr.innerHTML =
            '<td>' + escapeHtmlJs(p.title) + '</td>' +
            '<td>' + escapeHtmlJs(p.persona) + '</td>' +
            '<td class="' + confClass + '">' + (p.confidence * 100).toFixed(0) + '%</td>' +
            '<td><button class="llm-accept" onclick="acceptLlm(' + i + ')">Accepteren</button>' +
            '<button class="llm-reject" onclick="rejectLlm(' + i + ')">Afwijzen</button></td>';
          tbody.appendChild(tr);
        }
      }

      function escapeHtmlJs(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function acceptLlm(idx) {
        llmProposals[idx]._accepted = true;
        const tr = document.querySelector('#llmTableBody tr[data-idx="' + idx + '"]');
        if (tr) { tr.style.opacity = '0.6'; tr.querySelector('.llm-accept').textContent = 'Geaccepteerd'; }
      }

      function rejectLlm(idx) {
        llmProposals[idx]._accepted = false;
        const tr = document.querySelector('#llmTableBody tr[data-idx="' + idx + '"]');
        if (tr) { tr.style.opacity = '0.4'; tr.style.textDecoration = 'line-through'; tr.querySelector('.llm-reject').textContent = 'Afgewezen'; }
      }

      function acceptAllLlm() {
        for (let i = 0; i < llmProposals.length; i++) {
          if (llmProposals[i]._accepted !== false) acceptLlm(i);
        }
      }

      async function saveAcceptedLlm() {
        const accepted = llmProposals.filter(p => p._accepted === true);
        if (accepted.length === 0) {
          document.getElementById('llmSaveResult').innerHTML = '<span style="color:#f44747">Geen geaccepteerde voorstellen om op te slaan.</span>';
          return;
        }
        const mappings = {};
        for (const p of accepted) mappings[p.title] = p.persona;

        const resultDiv = document.getElementById('llmSaveResult');
        resultDiv.innerHTML = '<span style="color:#4fc1ff">Opslaan...</span>';
        try {
          const res = await fetch('/api/config/personas/mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings, merge: true }),
          });
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

  return renderLayout("Persona's", body, 'personas');
}

module.exports = { render, loadPersonaConfig, savePersonaConfig, PERSONA_CONFIG_PATH };
