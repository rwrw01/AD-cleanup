const { renderLayout, escapeHtml } = require('./layout');
const { getDatabase, getStats, getMaxNestingDepth, getUsersWithMostGroups, getDepartmentSummary } = require('../database');

function render() {
  const db = getDatabase();
  const stats = getStats(db);
  const maxNesting = getMaxNestingDepth(db);
  const topUsers = getUsersWithMostGroups(db, 10);
  const depts = getDepartmentSummary(db);

  const nestingClass = maxNesting > 5 ? 'critical' : maxNesting > 3 ? 'warning' : 'good';
  const critClass = stats.criticalFindings > 0 ? 'critical' : 'good';

  let body = `
    <h1>Dashboard</h1>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">Gebruikers</div><div class="value">${stats.users}</div></div>
      <div class="kpi-card"><div class="label">Actief / Disabled</div><div class="value">${stats.enabledUsers} / ${stats.disabledUsers}</div></div>
      <div class="kpi-card"><div class="label">Groepen</div><div class="value">${stats.groups}</div></div>
      <div class="kpi-card"><div class="label">Lidmaatschappen</div><div class="value">${stats.memberships}</div></div>
      <div class="kpi-card"><div class="label">Max Nesting</div><div class="value ${nestingClass}">${maxNesting}</div></div>
      <div class="kpi-card"><div class="label">Afdelingen</div><div class="value">${stats.departments}</div></div>
      <div class="kpi-card"><div class="label">Functies</div><div class="value">${stats.titles}</div></div>
      <div class="kpi-card"><div class="label">RBAC Rollen</div><div class="value">${stats.proposedRoles}</div></div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">Critical</div><div class="value ${critClass}">${stats.criticalFindings}</div></div>
      <div class="kpi-card"><div class="label">High</div><div class="value ${stats.highFindings > 0 ? 'warning' : 'good'}">${stats.highFindings}</div></div>
      <div class="kpi-card"><div class="label">Medium</div><div class="value">${stats.mediumFindings}</div></div>
      <div class="kpi-card"><div class="label">Low</div><div class="value">${stats.lowFindings}</div></div>
    </div>`;

  if (topUsers.length > 0) {
    body += `<h2>Meeste groepslidmaatschappen</h2><table><tr><th>Gebruiker</th><th>Groepen</th><th></th></tr>`;
    for (const u of topUsers) {
      const barWidth = Math.min(u.group_count, 200);
      body += `<tr><td><a href="/users?q=${escapeHtml(u.user_name)}">${escapeHtml(u.user_name)}</a></td><td>${u.group_count}</td><td><div class="depth-bar${u.group_count > 100 ? ' critical' : u.group_count > 50 ? ' deep' : ''}" style="width:${barWidth}px"></div></td></tr>`;
    }
    body += `</table>`;
  }

  if (depts.length > 0) {
    body += `<h2>Afdelingen</h2><table><tr><th>Afdeling</th><th>Medewerkers</th><th>Functies</th></tr>`;
    for (const d of depts.slice(0, 20)) {
      body += `<tr><td>${escapeHtml(d.department)}</td><td>${d.user_count}</td><td>${d.title_count}</td></tr>`;
    }
    if (depts.length > 20) body += `<tr><td colspan="3" style="color:#858585">... en ${depts.length - 20} meer</td></tr>`;
    body += `</table>`;
  }

  return renderLayout('Dashboard', body, 'dashboard');
}

module.exports = { render };
