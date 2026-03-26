const { renderLayout, escapeHtml } = require('./layout');
const { getDatabase } = require('../database');

function render(query) {
  const db = getDatabase();
  const filterType = query.type || '';
  const search = query.q || '';

  // Summary stats
  const summary = db.prepare(`
    SELECT change_type, COUNT(*) as count FROM simulation_results GROUP BY change_type
  `).all();

  const summaryMap = {};
  for (const s of summary) summaryMap[s.change_type] = s.count;

  const totalChanges = (summaryMap['TOEVOEGEN'] || 0) + (summaryMap['VERWIJDEREN'] || 0);

  // Per-user summary
  let userQuery = `
    SELECT user_name,
      SUM(CASE WHEN change_type = 'TOEVOEGEN' THEN 1 ELSE 0 END) as added,
      SUM(CASE WHEN change_type = 'VERWIJDEREN' THEN 1 ELSE 0 END) as removed,
      SUM(CASE WHEN change_type = 'BEHOUDEN' THEN 1 ELSE 0 END) as kept
    FROM simulation_results
  `;
  const whereConditions = [];
  const params = [];

  if (search) {
    whereConditions.push('user_name LIKE ?');
    params.push(`%${search}%`);
  }

  if (whereConditions.length > 0) {
    userQuery += ' WHERE ' + whereConditions.join(' AND ');
  }

  userQuery += ' GROUP BY user_name ORDER BY removed DESC, added DESC LIMIT 200';

  const users = db.prepare(userQuery).all(...params);

  let body = `
    <h1>IST/SOLL Simulatie</h1>
    <p style="color:#858585;margin-bottom:16px">Dry-run vergelijking: huidige situatie (IST) vs voorgesteld RBAC-model (SOLL). Geen wijzigingen in AD.</p>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">Toe te voegen</div><div class="value good">${summaryMap['TOEVOEGEN'] || 0}</div></div>
      <div class="kpi-card"><div class="label">Te verwijderen</div><div class="value critical">${summaryMap['VERWIJDEREN'] || 0}</div></div>
      <div class="kpi-card"><div class="label">Behouden</div><div class="value">${summaryMap['BEHOUDEN'] || 0}</div></div>
      <div class="kpi-card"><div class="label">Totaal wijzigingen</div><div class="value ${totalChanges > 0 ? 'warning' : 'good'}">${totalChanges}</div></div>
    </div>

    <input class="search-box" type="text" placeholder="Zoek gebruiker..." value="${escapeHtml(search)}"
      onkeyup="if(event.key==='Enter')location.href='/simulator?q='+encodeURIComponent(this.value)">

    <table>
      <tr><th>Gebruiker</th><th style="color:#89d185">Toevoegen</th><th style="color:#f44747">Verwijderen</th><th>Behouden</th><th>Risico</th></tr>`;

  for (const u of users) {
    const hasRisk = u.removed > 0;
    body += `<tr>
      <td><a href="/simulator/detail?name=${encodeURIComponent(u.user_name)}">${escapeHtml(u.user_name)}</a></td>
      <td class="change-add">${u.added > 0 ? '+' + u.added : '-'}</td>
      <td class="change-remove">${u.removed > 0 ? '-' + u.removed : '-'}</td>
      <td class="change-keep">${u.kept}</td>
      <td>${hasRisk ? '<span style="color:#f44747">Toegangsverlies</span>' : '<span style="color:#89d185">OK</span>'}</td>
    </tr>`;
  }

  body += `</table>`;
  return renderLayout('IST/SOLL Simulatie', body, 'simulator');
}

function renderDetail(query) {
  const db = getDatabase();
  const name = query.name || '';

  const changes = db.prepare(`
    SELECT change_type, group_name, role_name, risk_level, notes
    FROM simulation_results WHERE user_name = ?
    ORDER BY
      CASE change_type WHEN 'VERWIJDEREN' THEN 1 WHEN 'TOEVOEGEN' THEN 2 WHEN 'BEHOUDEN' THEN 3 END,
      group_name
  `).all(name);

  const user = db.prepare('SELECT display_name, department, title FROM users WHERE sam_account_name = ?').get(name);

  let body = `
    <h1>IST/SOLL: ${escapeHtml(user ? user.display_name || name : name)}</h1>`;

  if (user) {
    body += `<p>Afdeling: ${escapeHtml(user.department)} | Functie: ${escapeHtml(user.title)}</p>`;
  }

  const removed = changes.filter(c => c.change_type === 'VERWIJDEREN');
  const added = changes.filter(c => c.change_type === 'TOEVOEGEN');
  const kept = changes.filter(c => c.change_type === 'BEHOUDEN');

  if (removed.length > 0) {
    body += `<h2 style="color:#f44747">Vervallen (${removed.length})</h2>
      <table><tr><th>Groep</th><th>Via rollen</th><th>Opmerking</th></tr>`;
    for (const c of removed) {
      body += `<tr><td>${escapeHtml(c.group_name)}</td><td style="font-size:12px">${escapeHtml(c.role_name)}</td><td style="font-size:12px;color:#858585">${escapeHtml(c.notes)}</td></tr>`;
    }
    body += `</table>`;
  }

  if (added.length > 0) {
    body += `<h2 style="color:#89d185">Nieuw (${added.length})</h2>
      <table><tr><th>Groep</th><th>Via rollen</th></tr>`;
    for (const c of added) {
      body += `<tr><td>${escapeHtml(c.group_name)}</td><td style="font-size:12px">${escapeHtml(c.role_name)}</td></tr>`;
    }
    body += `</table>`;
  }

  if (kept.length > 0) {
    body += `<h2>Ongewijzigd (${kept.length})</h2>
      <table><tr><th>Groep</th></tr>`;
    for (const c of kept) {
      body += `<tr><td>${escapeHtml(c.group_name)}</td></tr>`;
    }
    body += `</table>`;
  }

  return renderLayout(`IST/SOLL: ${name}`, body, 'simulator');
}

module.exports = { render, renderDetail };
