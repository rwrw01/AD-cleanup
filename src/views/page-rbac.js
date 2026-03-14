const { renderLayout, escapeHtml } = require('./layout');
const { getDatabase } = require('../database');

function render(query) {
  const db = getDatabase();
  const filterLayer = query.layer || '';

  let whereClause = '1=1';
  const params = [];
  if (filterLayer) { whereClause += ' AND role_layer = ?'; params.push(filterLayer); }

  const roles = db.prepare(`
    SELECT id, role_name, role_layer, function_title, department, description, user_count, group_count
    FROM proposed_roles WHERE ${whereClause}
    ORDER BY role_layer, function_title, department
  `).all(...params);

  const tabHtml = ['', 'basis', 'afdeling'].map(l => {
    const label = l === '' ? 'Alles' : l === 'basis' ? 'Basisrollen' : 'Afdelingsrollen';
    const isActive = filterLayer === l ? ' active' : '';
    return `<a href="/rbac?layer=${l}" class="${isActive}">${label}</a>`;
  }).join('');

  let body = `
    <h1>RBAC Voorstel (${roles.length} rollen)</h1>
    <p style="color:#858585;margin-bottom:16px">Model: NIST/HL7 Healthcare RBAC — functie-eerst, afdeling tweede. Platte structuur (Entra ID-klaar).</p>
    <div class="tab-bar">${tabHtml}</div>
    <table>
      <tr><th>Rol</th><th>Laag</th><th>Functie</th><th>Afdeling</th><th>Users</th><th>Groepen</th></tr>`;

  for (const r of roles) {
    const layerColor = r.role_layer === 'basis' ? '#4fc1ff' : '#cca700';
    body += `<tr>
      <td><a href="/rbac/detail?id=${r.id}">${escapeHtml(r.role_name)}</a></td>
      <td><span style="color:${layerColor}">${escapeHtml(r.role_layer)}</span></td>
      <td>${escapeHtml(r.function_title)}</td>
      <td>${escapeHtml(r.department || '-')}</td>
      <td>${r.user_count}</td>
      <td>${r.group_count}</td>
    </tr>`;
  }

  body += `</table>`;
  db.close();
  return renderLayout('RBAC Voorstel', body, 'rbac');
}

function renderDetail(query) {
  const db = getDatabase();
  const id = parseInt(query.id, 10);

  const role = db.prepare('SELECT * FROM proposed_roles WHERE id = ?').get(id);
  if (!role) {
    db.close();
    return renderLayout('Rol niet gevonden', '<p>Rol niet gevonden.</p>', 'rbac');
  }

  const groups = db.prepare('SELECT group_name FROM proposed_role_groups WHERE role_id = ? ORDER BY group_name').all(id);
  const users = db.prepare('SELECT user_name, confidence, is_outlier FROM proposed_role_users WHERE role_id = ? ORDER BY user_name').all(id);

  let body = `
    <h1>${escapeHtml(role.role_name)}</h1>
    <table>
      <tr><td style="width:150px;color:#858585">Laag</td><td>${escapeHtml(role.role_layer)}</td></tr>
      <tr><td style="color:#858585">Functie</td><td>${escapeHtml(role.function_title)}</td></tr>
      <tr><td style="color:#858585">Afdeling</td><td>${escapeHtml(role.department || 'Alle')}</td></tr>
      <tr><td style="color:#858585">Beschrijving</td><td>${escapeHtml(role.description)}</td></tr>
    </table>

    <h2>Groepen in deze rol (${groups.length})</h2>
    <table><tr><th>Groep</th></tr>`;
  for (const g of groups) {
    body += `<tr><td><a href="/groups/detail?name=${encodeURIComponent(g.group_name)}">${escapeHtml(g.group_name)}</a></td></tr>`;
  }
  body += `</table>

    <h2>Gebruikers (${users.length})</h2>
    <table><tr><th>Account</th><th>Confidence</th></tr>`;
  for (const u of users) {
    body += `<tr><td><a href="/users/detail?name=${encodeURIComponent(u.user_name)}">${escapeHtml(u.user_name)}</a></td><td>${(u.confidence * 100).toFixed(0)}%</td></tr>`;
  }
  body += `</table>`;

  db.close();
  return renderLayout(role.role_name, body, 'rbac');
}

module.exports = { render, renderDetail };
