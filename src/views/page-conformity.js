const { renderLayout, escapeHtml, severityBadge } = require('./layout');
const { runConformityAnalysis, CONTAINER_TYPES, RESOURCE_TYPES } = require('../design-conformity');

const PERSONA_ORDER = [
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

const PERSONA_COLORS = {
  'Medisch specialist/Arts': '#4fc1ff',
  'Verpleegkundige': '#89d185',
  'Leidinggevende zorg': '#dcdcaa',
  'Medisch secretariaat': '#ce9178',
  'Medische ondersteuning': '#c586c0',
  'Bedrijfsvoering': '#9cdcfe',
  'Niet-medische ondersteuning': '#569cd6',
  'Externe medewerker': '#cca700',
  'Technisch account': '#555555',
  'Onbekend': '#858585',
};

const TECH_ACCOUNT_ICONS = {
  'Exchange Health Mailbox': '#f44747',
  'Autologon account (PC)': '#858585',
  'Service account': '#cca700',
  'Functionele mailbox': '#4fc1ff',
  'Leverancier': '#ce9178',
  'Beheer account': '#f48771',
  'Functioneel account': '#569cd6',
  'Noodtoegang (break-glass)': '#f44747',
  'Systeem/gMSA account': '#858585',
  'Gekoppeld account (geen e-mail)': '#c586c0',
  'Overig technisch account': '#555555',
};

function pctBar(value, max, color) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return `<div style="display:flex;align-items:center;gap:8px;">
    <div style="flex:1;background:#3c3c3c;border-radius:2px;height:8px;max-width:200px;">
      <div style="width:${pct.toFixed(1)}%;background:${color};height:100%;border-radius:2px;min-width:${value > 0 ? 2 : 0}px;"></div>
    </div>
    <span style="font-size:12px;color:#858585;">${value.toLocaleString('nl-NL')}</span>
  </div>`;
}

function tabsScript() {
  return `<script>
    function showTab(tabId) {
      document.querySelectorAll('.conf-tab-content').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.conf-tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + tabId).style.display = 'block';
      document.querySelector('[data-tab="' + tabId + '"]').classList.add('active');
      history.replaceState(null, '', '?tab=' + tabId);
    }
    // Init from URL
    const params = new URLSearchParams(window.location.search);
    const initTab = params.get('tab') || 'overzicht';
    document.addEventListener('DOMContentLoaded', () => showTab(initTab));
  </script>`;
}

function tabsStyle() {
  return `<style>
    .conf-tabs { display:flex; gap:0; border-bottom:2px solid #3c3c3c; margin-bottom:20px; }
    .conf-tab-btn { padding:10px 20px; color:#858585; background:none; border:none; border-bottom:2px solid transparent; font-size:13px; cursor:pointer; font-family:inherit; margin-bottom:-2px; }
    .conf-tab-btn:hover { color:#cccccc; background:#2a2d2e; }
    .conf-tab-btn.active { color:#ffffff; border-bottom-color:#4fc1ff; }
    .conf-tab-btn .tab-count { display:inline-block; background:#3c3c3c; color:#858585; font-size:11px; padding:1px 6px; border-radius:8px; margin-left:4px; }
    .conf-tab-btn.active .tab-count { background:#0e639c; color:#ffffff; }
    .conf-tab-content { display:none; }
    .card { background:#252526; border:1px solid #3c3c3c; border-radius:4px; padding:16px; margin-bottom:12px; }
    .card-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
    .card p { color:#858585; font-size:13px; }
    .two-col { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; }
    @media (max-width:900px) { .two-col { grid-template-columns:1fr; } }
  </style>`;
}

function render(query) {
  const data = runConformityAnalysis();
  const s = data.summary;

  const nestingScore = s.nestingToRemove === 0 ? 5 : s.nestingToRemove < 50 ? 3 : s.nestingToRemove < 200 ? 2 : 1;
  const directScore = s.directUserViolations === 0 ? 5 : s.directUserViolations < 100 ? 3 : s.directUserViolations < 1000 ? 2 : 1;
  const fgaScore = parseFloat(s.fgaCoveragePct) > 95 ? 5 : parseFloat(s.fgaCoveragePct) > 80 ? 3 : parseFloat(s.fgaCoveragePct) > 60 ? 2 : 1;
  const depthScore = s.depth3plusRelations === 0 ? 5 : s.depth3plusRelations < 1000 ? 3 : 2;
  const entraScore = s.entraSyncToRemove === 0 ? 5 : s.entraSyncToRemove < 50 ? 4 : 3;
  const overallScore = ((nestingScore + directScore + fgaScore + depthScore + entraScore) / 5).toFixed(1);
  const scoreColor = (score) => score >= 4 ? '#89d185' : score >= 3 ? '#cca700' : '#f44747';

  let body = tabsStyle() + `
    <h1>Ontwerp-conformiteit</h1>
    <p style="color:#858585;margin-bottom:16px;">Vergelijking van de huidige AD-structuur met het oorspronkelijke groepsontwerp.</p>

    <div class="conf-tabs">
      <button class="conf-tab-btn active" data-tab="overzicht" onclick="showTab('overzicht')">Overzicht</button>
      <button class="conf-tab-btn" data-tab="personas" onclick="showTab('personas')">Persona's <span class="tab-count">${data.humanUsers}</span></button>
      <button class="conf-tab-btn" data-tab="technisch" onclick="showTab('technisch')">Technische accounts <span class="tab-count">${data.personaSummary['Technisch account']?.count || 0}</span></button>
      <button class="conf-tab-btn" data-tab="nesting" onclick="showTab('nesting')">Nesting <span class="tab-count">${s.nestingToRemove}</span></button>
      <button class="conf-tab-btn" data-tab="schendingen" onclick="showTab('schendingen')">User-schendingen <span class="tab-count">${s.directUserViolations.toLocaleString('nl-NL')}</span></button>
      <button class="conf-tab-btn" data-tab="actieplan" onclick="showTab('actieplan')">Actieplan</button>
    </div>`;

  // === TAB: Overzicht ===
  body += `<div id="tab-overzicht" class="conf-tab-content" style="display:block;">`;
  body += renderOverviewTab(data, s, overallScore, scoreColor);
  body += `</div>`;

  // === TAB: Personas ===
  body += `<div id="tab-personas" class="conf-tab-content">`;
  body += renderPersonaTab(data);
  body += `</div>`;

  // === TAB: Technische accounts ===
  body += `<div id="tab-technisch" class="conf-tab-content">`;
  body += renderTechnicalTab(data);
  body += `</div>`;

  // === TAB: Nesting ===
  body += `<div id="tab-nesting" class="conf-tab-content">`;
  body += renderNestingTab(data);
  body += `</div>`;

  // === TAB: User-schendingen ===
  body += `<div id="tab-schendingen" class="conf-tab-content">`;
  body += renderViolationsTab(data);
  body += `</div>`;

  // === TAB: Actieplan ===
  body += `<div id="tab-actieplan" class="conf-tab-content">`;
  body += renderActionPlanTab(data, s);
  body += `</div>`;

  body += tabsScript();

  return renderLayout('Ontwerp-conformiteit', body, 'conformity');
}

// ======== TAB RENDERERS ========

function renderOverviewTab(data, s, overallScore, scoreColor) {
  let html = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">Conformiteitsscore</div><div class="value" style="color:${scoreColor(overallScore)}">${overallScore} <span style="font-size:14px;color:#858585;">/ 5</span></div></div>
      <div class="kpi-card"><div class="label">Medewerkers</div><div class="value">${data.humanUsers.toLocaleString('nl-NL')}</div></div>
      <div class="kpi-card"><div class="label">Technische accounts</div><div class="value" style="color:#858585">${(data.personaSummary['Technisch account']?.count || 0).toLocaleString('nl-NL')}</div></div>
      <div class="kpi-card"><div class="label">Groepen</div><div class="value">${data.totalGroups.toLocaleString('nl-NL')}</div></div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">Illegale nesting</div><div class="value critical">${s.nestingToRemove}</div></div>
      <div class="kpi-card"><div class="label">Directe user-schendingen</div><div class="value critical">${s.directUserViolations.toLocaleString('nl-NL')}</div></div>
      <div class="kpi-card"><div class="label">FGA-dekking</div><div class="value ${parseFloat(s.fgaCoveragePct) > 90 ? 'good' : 'warning'}">${s.fgaCoveragePct}%</div></div>
      <div class="kpi-card"><div class="label">Entra-sync groepen</div><div class="value warning">${s.entraSyncToRemove}</div></div>
      <div class="kpi-card"><div class="label">Diepte &gt;2 relaties</div><div class="value ${s.depth3plusRelations > 0 ? 'critical' : 'good'}">${s.depth3plusRelations.toLocaleString('nl-NL')}</div></div>
      <div class="kpi-card"><div class="label">Max nestingdiepte</div><div class="value warning">${data.depthDistribution.length > 0 ? data.depthDistribution[data.depthDistribution.length - 1].depth : 0}</div></div>
    </div>`;

  // Design rules
  html += `<h2>Oorspronkelijk groepsontwerp</h2>
    <div class="two-col">
      <div class="card">
        <h3 style="margin-top:0;color:#89d185;">Toegestaan</h3>
        <div style="font-size:13px;line-height:2;">
          <div>User \u2192 <span style="color:#4fc1ff;">FGA</span>, <span style="color:#4fc1ff;">afdl</span>, <span style="color:#4fc1ff;">affu</span>, <span style="color:#4fc1ff;">plus</span>, <span style="color:#4fc1ff;">ctxr</span></div>
          <div><span style="color:#4fc1ff;">FGA/afdl/affu/plus</span> \u2192 <span style="color:#ce9178;">appl</span>, <span style="color:#ce9178;">drvm</span>, <span style="color:#ce9178;">ntfs</span>, <span style="color:#ce9178;">mail</span></div>
          <div><span style="color:#ce9178;">appl</span> \u2192 <span style="color:#ce9178;">drvm</span>, <span style="color:#ce9178;">ntfs</span></div>
          <div><span style="color:#4fc1ff;">plus</span> \u2192 <span style="color:#ce9178;">appl</span>, <span style="color:#ce9178;">drvm</span>, <span style="color:#ce9178;">ntfs</span></div>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-top:0;color:#f44747;">Verboden</h3>
        <div style="font-size:13px;line-height:2;">
          <div>User \u2192 <span style="color:#f44747;">appl</span>, <span style="color:#f44747;">drvm</span>, <span style="color:#f44747;">ntfs</span> (alleen via container)</div>
          <div><span style="color:#f44747;">appl \u2192 appl</span>, <span style="color:#f44747;">drvm \u2192 drvm</span>, <span style="color:#f44747;">ntfs \u2192 ntfs</span> (soortgenoten)</div>
          <div><span style="color:#f44747;">appl/ntfs \u2192 fga/afdl/affu</span> (omgekeerde richting)</div>
          <div><span style="color:#f44747;">affu \u2192 FGA</span> (parallel, niet genest)</div>
        </div>
      </div>
    </div>
    <div class="code-block" style="margin-bottom:20px;">
      <code>User \u2500\u252c\u2500 Domain Users
     \u251c\u2500 FGA-groep        \u2500\u252c\u2500 appl- (algemeen)    \u2500\u2500 drvm- / ntfs-
     \u251c\u2500 afdl-groep       \u2500\u252c\u2500 appl- (afdeling)    \u2500\u2500 ntfs- / mail-
     \u251c\u2500 affu-groep       \u2500\u252c\u2500 appl- (functie)     \u2500\u2500 ntfs- / drvm-
     \u251c\u2500 plus-groep       \u2500\u252c\u2500 appl- / ntfs- (uitzondering)
     \u2514\u2500 ctxr-groep</code>
    </div>`;

  // Group distribution
  html += renderGroupDistribution(data);

  return html;
}

function renderPersonaTab(data) {
  const ps = data.personaSummary;
  const humanPersonas = PERSONA_ORDER.filter(p => p !== 'Technisch account' && p !== 'Onbekend');
  const maxCount = Math.max(...humanPersonas.map(p => ps[p]?.count || 0));
  const totalHuman = data.humanUsers;

  let html = `<h2>Persona-inschatting <span style="font-size:14px;color:#858585;">(${totalHuman.toLocaleString('nl-NL')} medewerkers)</span></h2>
    <p style="color:#858585;margin-bottom:16px;">Classificatie op basis van functietitel, afdeling en FGA-lidmaatschap. Technische accounts zijn uitgesloten.</p>`;

  // Visual chart
  html += `<div style="display:flex;gap:2px;height:32px;border-radius:4px;overflow:hidden;margin-bottom:20px;">`;
  for (const name of humanPersonas) {
    if (!ps[name]) continue;
    const pct = (ps[name].count / data.totalUsers) * 100;
    if (pct < 0.5) continue;
    const color = PERSONA_COLORS[name] || '#858585';
    html += `<div style="width:${pct}%;background:${color};display:flex;align-items:center;justify-content:center;" title="${escapeHtml(name)}: ${ps[name].count}">
      ${pct > 5 ? `<span style="font-size:10px;color:#1e1e1e;font-weight:600;">${Math.round(pct)}%</span>` : ''}
    </div>`;
  }
  html += `</div>`;

  // Table
  html += `<table>
    <tr><th style="width:230px;">Persona</th><th style="width:70px;">Aantal</th><th style="width:60px;">%</th><th style="width:220px;">Verdeling</th><th>Meest voorkomende functies</th></tr>`;

  for (const name of humanPersonas) {
    if (!ps[name]) continue;
    const p = ps[name];
    const pct = ((p.count / totalHuman) * 100).toFixed(1);
    const color = PERSONA_COLORS[name] || '#858585';
    const barWidth = maxCount > 0 ? (p.count / maxCount) * 180 : 0;
    const topTitles = p.topTitles.slice(0, 3)
      .map(t => `${escapeHtml(t.title)} <span style="color:#858585">(${t.count})</span>`)
      .join(', ');

    html += `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle;"></span>${escapeHtml(name)}</td>
      <td style="text-align:right;font-weight:600;">${p.count.toLocaleString('nl-NL')}</td>
      <td style="text-align:right;">${pct}%</td>
      <td><div style="width:${barWidth}px;height:10px;background:${color};border-radius:2px;min-width:${p.count > 0 ? 2 : 0}px;"></div></td>
      <td style="font-size:12px;">${topTitles}</td>
    </tr>`;
  }

  html += `<tr style="border-top:2px solid #555;">
    <td style="font-weight:600;">Totaal medewerkers</td>
    <td style="text-align:right;font-weight:600;">${totalHuman.toLocaleString('nl-NL')}</td>
    <td style="text-align:right;">100%</td><td></td><td></td>
  </tr></table>`;

  // FGA alignment
  html += `<h2>FGA-groep afstemming</h2>
    <p style="color:#858585;margin-bottom:12px;">De FGA-groepen bevestigen de persona-classificatie. Onderstaand de verdeling per FGA-groep.</p>
    <table><tr><th>FGA-groep</th><th style="width:80px;">Leden</th><th>Dominante persona</th><th>Overige</th></tr>`;

  // Build FGA→persona map inline
  const fgaMap = buildFgaPersonaMap(data);
  for (const [fga, info] of Object.entries(fgaMap).sort((a, b) => b[1].total - a[1].total)) {
    if (info.total === 0) continue;
    const sorted = Object.entries(info.personas).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) continue;
    const dominant = sorted[0];
    const rest = sorted.slice(1).filter(([, c]) => c > 0).map(([p, c]) => `${p} (${c})`).join(', ');
    const dominantColor = PERSONA_COLORS[dominant[0]] || '#858585';
    html += `<tr>
      <td>${escapeHtml(fga)}</td>
      <td style="text-align:right;">${info.total}</td>
      <td><span style="color:${dominantColor};">\u25CF</span> ${escapeHtml(dominant[0])} (${dominant[1]})</td>
      <td style="font-size:12px;color:#858585;">${rest || '\u2014'}</td>
    </tr>`;
  }
  html += `</table>`;

  return html;
}

function buildFgaPersonaMap(data) {
  // We need to recalculate this from DB - use cached data from personaSummary
  // Actually, let's compute it properly
  const { classifyPersona, classifyTechnicalAccount } = require('../design-conformity');
  const { getDatabase } = require('../database');
  const db = getDatabase();

  const users = db.prepare('SELECT sam_account_name, title, department FROM users WHERE enabled = 1').all();
  const fgaMembers = db.prepare("SELECT member_name, group_name FROM memberships WHERE member_type = 'user' AND (group_name LIKE 'FGA %' OR group_name LIKE 'FGA-%')").all();

  const userFga = {};
  for (const m of fgaMembers) {
    if (!userFga[m.member_name]) userFga[m.member_name] = [];
    userFga[m.member_name].push(m.group_name);
  }

  const fgaMap = {};
  for (const m of fgaMembers) {
    if (!fgaMap[m.group_name]) fgaMap[m.group_name] = { total: 0, personas: {} };
    const u = users.find(u => u.sam_account_name === m.member_name);
    if (!u) continue;
    const fgas = userFga[u.sam_account_name] || [];
    const persona = classifyPersona(u.title, u.department, fgas);
    if (persona === 'Technisch account') continue; // skip tech accounts
    fgaMap[m.group_name].total++;
    fgaMap[m.group_name].personas[persona] = (fgaMap[m.group_name].personas[persona] || 0) + 1;
  }

  return fgaMap;
}

function renderTechnicalTab(data) {
  const tb = data.technicalBreakdown;
  const totalTech = data.personaSummary['Technisch account']?.count || 0;
  const maxCount = Math.max(...Object.values(tb).map(v => v.count), 1);

  let html = `<h2>Technische accounts <span style="font-size:14px;color:#858585;">(${totalTech.toLocaleString('nl-NL')} actieve accounts zonder functietitel)</span></h2>
    <p style="color:#858585;margin-bottom:16px;">Dit zijn geen menselijke gebruikers maar systeem-, service- en functionele accounts. Ze zijn actief in AD maar vereisen geen persona-toewijzing.</p>`;

  html += `<table>
    <tr><th style="width:250px;">Type</th><th style="width:80px;">Aantal</th><th style="width:220px;">Verdeling</th><th>Voorbeelden</th></tr>`;

  const sorted = Object.entries(tb).sort((a, b) => b[1].count - a[1].count);
  for (const [type, info] of sorted) {
    const color = TECH_ACCOUNT_ICONS[type] || '#858585';
    const examples = info.examples
      .map(e => `<span style="color:#cccccc;">${escapeHtml(e.sam)}</span> <span style="color:#555;">${escapeHtml(e.displayName)}</span>`)
      .join('<br>');

    html += `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};margin-right:8px;vertical-align:middle;"></span>${escapeHtml(type)}</td>
      <td style="text-align:right;font-weight:600;">${info.count}</td>
      <td>${pctBar(info.count, maxCount, color)}</td>
      <td style="font-size:12px;">${examples}</td>
    </tr>`;
  }

  html += `<tr style="border-top:2px solid #555;">
    <td style="font-weight:600;">Totaal</td>
    <td style="text-align:right;font-weight:600;">${totalTech.toLocaleString('nl-NL')}</td>
    <td></td><td></td>
  </tr></table>`;

  html += `<div class="card" style="margin-top:16px;">
    <h3 style="margin-top:0;color:#cca700;">Aanbeveling</h3>
    <p>Deze accounts vervuilen de gebruikerslijst en bemoeilijken rapportage. Overweeg:</p>
    <ul style="font-size:13px;color:#cccccc;margin-top:8px;padding-left:20px;line-height:1.8;">
      <li><strong>Exchange Health Mailboxes</strong> \u2014 standaard Exchange-objecten, kunnen uitgesloten worden van sync en rapportages</li>
      <li><strong>Autologon accounts</strong> \u2014 verplaats naar een aparte OU en sluit uit van Entra-sync</li>
      <li><strong>Service accounts</strong> \u2014 migreer naar Group Managed Service Accounts (gMSA) waar mogelijk</li>
      <li><strong>Leveranciers</strong> \u2014 evalueer of deze via Entra External Identities (B2B) kunnen</li>
      <li><strong>Noodtoegang</strong> \u2014 documenteer en monitor via Privileged Access Management</li>
    </ul>
  </div>`;

  // Entra sync groups section
  html += renderEntraSyncSection(data);

  // FGA coverage
  html += renderFgaCoverage(data);

  return html;
}

function renderNestingTab(data) {
  let html = '';

  // Depth analysis
  html += renderDepthAnalysis(data);

  // Nesting violations
  const violations = data.nestingViolations;
  if (violations.length === 0) {
    html += `<h2>Nesting-schendingen</h2><p style="color:#89d185;">Geen nesting-schendingen gevonden.</p>`;
    return html;
  }

  const byType = {};
  for (const v of violations) {
    if (!byType[v.violation]) byType[v.violation] = [];
    byType[v.violation].push(v);
  }

  const violationLabels = {
    'soortgenoot': { label: 'Soortgenoot-nesting', severity: 'HIGH', desc: 'Groep genest in groep van hetzelfde type (bijv. appl in appl). Verboden per ontwerp.' },
    'omgekeerd': { label: 'Omgekeerde nesting', severity: 'HIGH', desc: 'Resourcegroep genest in containergroep (bijv. appl in affu). Richting moet andersom.' },
    'affu-in-fga': { label: 'affu genest in FGA', severity: 'CRITICAL', desc: 'affu-groepen zijn genest in FGA-groepen. In het ontwerp zijn dit parallelle lagen \u2014 een user is lid van BEIDE, niet affu via FGA. Dit is de hoofdoorzaak van overmatige nestingdiepte.' },
    'afdl-in-fga': { label: 'afdl genest in FGA', severity: 'MEDIUM', desc: 'afdl-groepen genest in FGA-groepen. Zelfde probleem als affu-in-FGA.' },
  };

  html += `<h2>Nesting-schendingen <span style="color:#f44747;font-size:14px;">(${violations.length} relaties)</span></h2>`;

  for (const [type, items] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) {
    const info = violationLabels[type] || { label: type, severity: 'MEDIUM', desc: '' };
    html += `<div class="card">
      <div class="card-header">
        ${severityBadge(info.severity)}
        <strong>${escapeHtml(info.label)}</strong>
        <span style="color:#858585;">\u2014 ${items.length} relaties</span>
      </div>
      <p>${info.desc}</p>`;

    if (type === 'affu-in-fga') {
      html += `<table><tr><th>FGA-groep</th><th style="width:120px;">affu-groepen</th><th>Voorbeelden</th></tr>`;
      for (const [fga, affus] of Object.entries(data.affuByFga).sort((a, b) => b[1].length - a[1].length)) {
        const examples = affus.slice(0, 4).map(a => escapeHtml(a)).join(', ');
        const more = affus.length > 4 ? ` <span style="color:#858585">+${affus.length - 4}</span>` : '';
        html += `<tr><td>${escapeHtml(fga)}</td><td style="text-align:right;font-weight:600;">${affus.length}</td><td style="font-size:12px;">${examples}${more}</td></tr>`;
      }
      html += `</table>`;
    } else {
      html += `<table><tr><th>Kind (genest)</th><th>Type</th><th>In groep (ouder)</th><th>Type</th></tr>`;
      for (const v of items.slice(0, 15)) {
        html += `<tr><td>${escapeHtml(v.child)}</td><td style="color:#858585;">${v.childType}</td><td>${escapeHtml(v.parent)}</td><td style="color:#858585;">${v.parentType}</td></tr>`;
      }
      if (items.length > 15) html += `<tr><td colspan="4" style="color:#858585;">... en ${items.length - 15} meer</td></tr>`;
      html += `</table>`;
    }
    html += `</div>`;
  }

  return html;
}

function renderViolationsTab(data) {
  const dv = data.directUserViolations;
  const total = Object.values(dv).reduce((s, v) => s + v.count, 0);

  let html = `<h2>Directe user-in-resource schendingen <span style="color:#f44747;font-size:14px;">(${total.toLocaleString('nl-NL')} lidmaatschappen)</span></h2>
    <p style="color:#858585;margin-bottom:16px;">Gebruikers die direct lid zijn van resource-groepen. Per ontwerp moeten ze via een container-groep (FGA/afdl/affu/plus) lopen.</p>`;

  if (total === 0) {
    html += `<div class="card"><p style="color:#89d185;">Geen schendingen gevonden.</p></div>`;
    return html;
  }

  const typeLabels = {
    appl: { label: 'appl- (applicaties)', note: 'Moeten via FGA/afdl/affu/plus-container lopen', severity: 'HIGH' },
    mail: { label: 'mail- (mailboxen)', note: 'Review nodig: distributielijsten mogen direct, security-groepen niet', severity: 'MEDIUM' },
    ntfs: { label: 'ntfs- (bestandsrechten)', note: 'Moeten via container-groep lopen', severity: 'HIGH' },
    drvm: { label: 'drvm- (schijfmappings)', note: 'Moeten via container-groep lopen', severity: 'HIGH' },
  };

  for (const [type, info] of Object.entries(dv).sort((a, b) => b.count - a.count)) {
    const meta = typeLabels[type] || { label: type, note: '', severity: 'MEDIUM' };
    html += `<div class="card">
      <div class="card-header">
        ${severityBadge(meta.severity)}
        <strong>${escapeHtml(meta.label)}</strong>
        <span style="color:#858585;">\u2014 ${info.count.toLocaleString('nl-NL')} lidmaatschappen in ${Object.keys(info.groups).length} groepen</span>
      </div>
      <p>${meta.note}</p>
      <table><tr><th>Groep</th><th style="width:120px;">Directe users</th></tr>`;

    for (const g of info.topGroups) {
      html += `<tr><td><a href="/groups/detail?name=${encodeURIComponent(g.name)}">${escapeHtml(g.name)}</a></td><td style="text-align:right;">${g.count}</td></tr>`;
    }
    const remaining = Object.keys(info.groups).length - info.topGroups.length;
    if (remaining > 0) html += `<tr><td colspan="2" style="color:#858585;">... en ${remaining} meer groepen</td></tr>`;
    html += `</table></div>`;
  }

  return html;
}

function renderActionPlanTab(data, s) {
  let html = `<h2>Actieplan: terugkeer naar ontwerp</h2>
    <p style="color:#858585;margin-bottom:16px;">Stapsgewijs plan om de huidige AD-structuur terug te brengen naar het oorspronkelijke ontwerp, geordend op risico en impact.</p>

    <table>
      <tr><th style="width:40px;">#</th><th style="width:220px;">Actie</th><th style="width:140px;">Omvang</th><th style="width:80px;">Risico</th><th>Toelichting</th></tr>
      <tr>
        <td style="font-weight:600;">1</td>
        <td><strong>Group_ groepen uit sync</strong></td>
        <td>${s.entraSyncToRemove} groepen</td>
        <td>${severityBadge('LOW')}</td>
        <td>M365/Teams-groepen uit Entra Connect scope halen. Geen impact op rechten.</td>
      </tr>
      <tr>
        <td style="font-weight:600;">2</td>
        <td><strong>affu \u2192 FGA nesting verbreken</strong></td>
        <td>${s.nestingByType['affu-in-fga'] || 0} relaties</td>
        <td>${severityBadge('MEDIUM')}</td>
        <td>Grootste bron van nestingdiepte. Eerst valideren dat affu-groepen zelf al in de juiste appl/ntfs nesten.</td>
      </tr>
      <tr>
        <td style="font-weight:600;">3</td>
        <td><strong>Soortgenoot-nesting verwijderen</strong></td>
        <td>${s.nestingByType['soortgenoot'] || 0} relaties</td>
        <td>${severityBadge('LOW')}</td>
        <td>appl-in-appl nesting is per ontwerp verboden. Verwijderen is veilig.</td>
      </tr>
      <tr>
        <td style="font-weight:600;">4</td>
        <td><strong>Omgekeerde nesting corrigeren</strong></td>
        <td>${s.nestingByType['omgekeerd'] || 0} relaties</td>
        <td>${severityBadge('MEDIUM')}</td>
        <td>Resource-groepen in containers. Per geval beoordelen of de nesting omgedraaid of verwijderd moet worden.</td>
      </tr>
      <tr>
        <td style="font-weight:600;">5</td>
        <td><strong>Directe user-in-appl oplossen</strong></td>
        <td>${(data.directUserViolations.appl?.count || 0).toLocaleString('nl-NL')} lidm.</td>
        <td>${severityBadge('HIGH')}</td>
        <td>Users uit appl-groepen halen en via de juiste container (fga/afdl/affu/plus) laten lopen. Grootste operationele klus.</td>
      </tr>
      <tr>
        <td style="font-weight:600;">6</td>
        <td><strong>Mail-groepen reviewen</strong></td>
        <td>${(data.directUserViolations.mail?.count || 0).toLocaleString('nl-NL')} lidm.</td>
        <td>${severityBadge('MEDIUM')}</td>
        <td>Vaststellen welke mail-groepen distributielijsten zijn (direct OK) en welke security-groepen (via container).</td>
      </tr>
      <tr>
        <td style="font-weight:600;">7</td>
        <td><strong>FGA-dekking verhogen</strong></td>
        <td>${data.fgaCoverage.withoutFga} users</td>
        <td>${severityBadge('LOW')}</td>
        <td>Alle actieve medewerkers moeten in minimaal 1 FGA-groep zitten.</td>
      </tr>
      <tr>
        <td style="font-weight:600;">8</td>
        <td><strong>Technische accounts opschonen</strong></td>
        <td>${(data.personaSummary['Technisch account']?.count || 0)} accounts</td>
        <td>${severityBadge('LOW')}</td>
        <td>HealthMailboxes uitsluiten, service accounts naar gMSA, leveranciers naar Entra B2B.</td>
      </tr>
    </table>`;

  html += `<div class="card" style="margin-top:20px;">
    <h3 style="margin-top:0;color:#cca700;">Risico-inschatting nesting-opschoning</h3>
    <p>Bij het verbreken van de affu\u2192FGA nesting verdwijnen <strong>${s.depth3plusRelations.toLocaleString('nl-NL')}</strong> effectieve relaties op diepte &gt;2 (${s.reductionPct}% van totaal).</p>
    <p style="margin-top:8px;">Deze relaties zijn nu <strong>niet via een korter pad bereikbaar</strong>. Bij het verbreken van de nesting kan er dus toegangsverlies optreden als de affu-groepen niet zelf al in dezelfde appl/ntfs-groepen nesten.</p>
    <p style="color:#cca700;margin-top:12px;"><strong>Aanbeveling:</strong> per afdeling valideren dat de directe paden (affu\u2192appl\u2192ntfs) dezelfde rechten dekken als de indirecte (affu\u2192FGA\u2192appl\u2192ntfs) voordat de nesting wordt verbroken.</p>
  </div>

  <div class="card">
    <h3 style="margin-top:0;color:#89d185;">Verwacht resultaat na opschoning</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:12px;">
      <div>
        <div style="font-size:12px;color:#858585;text-transform:uppercase;margin-bottom:4px;">Nu</div>
        <div style="font-size:13px;line-height:1.8;">
          Max nestingdiepte: <strong style="color:#f44747;">5</strong><br>
          Effectieve relaties: <strong>${(s.totalEffectiveRelations).toLocaleString('nl-NL')}</strong><br>
          Entra-blokkering: <strong style="color:#f44747;">Ja</strong><br>
          Groepen in scope: <strong>${data.totalGroups.toLocaleString('nl-NL')}</strong>
        </div>
      </div>
      <div>
        <div style="font-size:12px;color:#858585;text-transform:uppercase;margin-bottom:4px;">Na opschoning</div>
        <div style="font-size:13px;line-height:1.8;">
          Max nestingdiepte: <strong style="color:#89d185;">2</strong> (max 3 bij appl\u2192ntfs)<br>
          Effectieve relaties: <strong>~${(s.totalEffectiveRelations - s.depth3plusRelations).toLocaleString('nl-NL')}</strong><br>
          Entra-blokkering: <strong style="color:#89d185;">Opgeheven</strong> (nesting)<br>
          Groepen in scope: <strong>~${(data.totalGroups - s.entraSyncToRemove).toLocaleString('nl-NL')}</strong>
        </div>
      </div>
    </div>
  </div>`;

  return html;
}

// ======== SHARED COMPONENTS ========

function renderGroupDistribution(data) {
  const typeLabels = {
    fga: 'FGA (functionele groeptoewijzing)', afdl: 'afdl- (afdeling)', affu: 'affu- (afdeling/functie)',
    appl: 'appl- (applicatie)', drvm: 'drvm- (schijfmapping)', ctxr: 'ctxr- (virtual desktop)',
    ntfs: 'ntfs- (bestandsrechten)', mail: 'mail- (mailboxen)', plus: 'plus- (uitzonderingen)',
    entra_sync: 'Group_ (Entra/M365 sync)', adm: 'Adm- (beheer)', sec: 'sec_ (security)',
    mg: 'MG (mailgroepen)', func: 'func- (functiegroepen)', cloud: 'o365/mig (cloud/migratie)', overig: 'Overig',
  };
  const maxCount = Math.max(...Object.values(data.groupDistribution).map(d => d.count));
  const order = ['fga', 'afdl', 'affu', 'plus', 'ctxr', 'appl', 'drvm', 'ntfs', 'mail', 'adm', 'sec', 'func', 'mg', 'cloud', 'entra_sync', 'overig'];

  let html = `<h2>Groepsverdeling per type</h2><table>
    <tr><th style="width:280px;">Type</th><th style="width:80px;">Aantal</th><th style="width:220px;">Verdeling</th><th>Voorbeelden</th></tr>`;
  for (const type of order) {
    const d = data.groupDistribution[type];
    if (!d) continue;
    const label = typeLabels[type] || type;
    const isContainer = CONTAINER_TYPES.includes(type);
    const isResource = RESOURCE_TYPES.includes(type);
    const color = isContainer ? '#4fc1ff' : isResource ? '#ce9178' : type === 'entra_sync' ? '#cca700' : '#858585';
    html += `<tr>
      <td><span style="color:${color};">\u25CF</span> ${escapeHtml(label)}</td>
      <td style="text-align:right;font-weight:600;">${d.count}</td>
      <td>${pctBar(d.count, maxCount, color)}</td>
      <td style="font-size:12px;color:#858585;">${d.examples.map(e => escapeHtml(e)).join(', ')}</td>
    </tr>`;
  }
  html += `</table>`;
  return html;
}

function renderDepthAnalysis(data) {
  const dist = data.depthDistribution;
  const total = dist.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...dist.map(d => d.count));

  let html = `<h2>Nestingdiepte-analyse</h2>
    <p style="color:#858585;margin-bottom:12px;">In het oorspronkelijke ontwerp is de maximale diepte 2 (user \u2192 container \u2192 resource), maximaal 3 bij appl\u2192ntfs.</p>
    <table>
      <tr><th style="width:80px;">Diepte</th><th style="width:150px;">Relaties</th><th style="width:60px;">%</th><th style="width:220px;">Verdeling</th><th style="width:100px;">Status</th></tr>`;
  for (const d of dist) {
    const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : '0';
    const color = d.depth <= 2 ? '#89d185' : d.depth === 3 ? '#cca700' : '#f44747';
    const status = d.depth <= 2 ? '<span style="color:#89d185;">Conform</span>' : '<span style="color:#f44747;">Afwijking</span>';
    html += `<tr>
      <td>${d.depth}</td>
      <td style="text-align:right;">${d.count.toLocaleString('nl-NL')}</td>
      <td style="text-align:right;">${pct}%</td>
      <td>${pctBar(d.count, maxCount, color)}</td>
      <td>${status}</td>
    </tr>`;
  }
  const conformCount = dist.filter(d => d.depth <= 2).reduce((s, d) => s + d.count, 0);
  const violationCount = dist.filter(d => d.depth > 2).reduce((s, d) => s + d.count, 0);
  html += `<tr style="border-top:2px solid #555;">
    <td style="font-weight:600;">Totaal</td>
    <td style="text-align:right;font-weight:600;">${total.toLocaleString('nl-NL')}</td>
    <td></td><td></td>
    <td><span style="color:#89d185;">${conformCount.toLocaleString('nl-NL')}</span> / <span style="color:#f44747;">${violationCount.toLocaleString('nl-NL')}</span></td>
  </tr></table>`;
  return html;
}

function renderEntraSyncSection(data) {
  const es = data.entraSyncGroups;
  let html = `<h2>Entra/M365 teruggesynchroniseerde groepen <span style="color:#cca700;font-size:14px;">(${es.count})</span></h2>
    <p style="color:#858585;margin-bottom:12px;">Group_-groepen met GUID zijn M365/Teams-groepen die zijn teruggesynchroniseerd naar lokale AD. Ze hoeven niet lokaal te bestaan.</p>`;
  if (es.count > 0) {
    html += `<div class="card">
      <div class="card-header">${severityBadge('MEDIUM')} <strong>${es.count} groepen kunnen uit lokale sync</strong></div>
      <p>Distribution/Universal groepen zonder functie in de lokale AD. Ze vervuilen de namespace.</p>
      <div style="margin-top:8px;font-size:13px;font-family:monospace;">`;
    for (const ex of es.examples) html += `${escapeHtml(ex)}<br>`;
    if (es.count > es.examples.length) html += `<span style="color:#858585;">... en ${es.count - es.examples.length} meer</span>`;
    html += `</div></div>`;
  }
  return html;
}

function renderFgaCoverage(data) {
  const fc = data.fgaCoverage;
  return `<h2>FGA-dekking</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
      <div class="kpi-card"><div class="label">Actieve users</div><div class="value">${fc.totalActive.toLocaleString('nl-NL')}</div></div>
      <div class="kpi-card"><div class="label">In FGA-groep</div><div class="value good">${fc.inFga.toLocaleString('nl-NL')}</div></div>
      <div class="kpi-card"><div class="label">Zonder FGA</div><div class="value ${fc.withoutFga > 0 ? 'warning' : 'good'}">${fc.withoutFga.toLocaleString('nl-NL')}</div></div>
    </div>
    ${fc.withoutFga > 0 ? `<p style="color:#cca700;font-size:13px;">${fc.withoutFga} actieve accounts zijn niet in een FGA-groep. Het merendeel zijn technische accounts \u2014 voor medewerkers is een FGA-groep vereist.</p>` : ''}`;
}

module.exports = { render };
