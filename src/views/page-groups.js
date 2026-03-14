const { renderLayout, escapeHtml } = require('./layout');
const { getDatabase } = require('../database');

function render(query) {
  const db = getDatabase();
  const search = query.q || '';

  let groups;
  if (search) {
    groups = db.prepare(`
      SELECT g.name, g.category, g.scope, g.member_count, g.managed_by, g.description,
             COALESCE(n.max_depth, 0) as max_depth,
             COALESCE(n.effective_users, 0) as effective_users
      FROM groups g
      LEFT JOIN (
        SELECT group_name, MAX(depth) as max_depth, COUNT(DISTINCT user_name) as effective_users
        FROM effective_memberships GROUP BY group_name
      ) n ON g.name = n.group_name
      WHERE g.name LIKE ? OR g.description LIKE ?
      ORDER BY n.max_depth DESC, g.member_count DESC
    `).all(`%${search}%`, `%${search}%`);
  } else {
    groups = db.prepare(`
      SELECT g.name, g.category, g.scope, g.member_count, g.managed_by, g.description,
             COALESCE(n.max_depth, 0) as max_depth,
             COALESCE(n.effective_users, 0) as effective_users
      FROM groups g
      LEFT JOIN (
        SELECT group_name, MAX(depth) as max_depth, COUNT(DISTINCT user_name) as effective_users
        FROM effective_memberships GROUP BY group_name
      ) n ON g.name = n.group_name
      ORDER BY n.max_depth DESC, g.member_count DESC
    `).all();
  }

  let body = `
    <h1>Groepen (${groups.length})</h1>
    <input class="search-box" type="text" placeholder="Zoek groep..." value="${escapeHtml(search)}"
      onkeyup="if(event.key==='Enter')location.href='/groups?q='+encodeURIComponent(this.value)">
    <table>
      <tr><th>Groep</th><th>Type</th><th>Scope</th><th>Leden</th><th>Effectief</th><th>Nesting</th><th>Eigenaar</th></tr>`;

  for (const g of groups) {
    const depthClass = g.max_depth > 5 ? 'critical' : g.max_depth > 3 ? 'deep' : '';
    const depthWidth = Math.max(g.max_depth * 15, 4);
    body += `<tr>
      <td><a href="/groups/detail?name=${encodeURIComponent(g.name)}">${escapeHtml(g.name)}</a></td>
      <td>${escapeHtml(g.category)}</td>
      <td>${escapeHtml(g.scope)}</td>
      <td>${g.member_count}</td>
      <td>${g.effective_users}</td>
      <td><div class="depth-bar ${depthClass}" style="width:${depthWidth}px" title="${g.max_depth} niveaus"></div> ${g.max_depth}</td>
      <td>${escapeHtml(g.managed_by)}</td>
    </tr>`;
  }

  body += `</table>`;
  db.close();
  return renderLayout('Groepen', body, 'groups');
}

function renderDetail(query) {
  const db = getDatabase();
  const name = query.name || '';

  const group = db.prepare('SELECT * FROM groups WHERE name = ?').get(name);
  if (!group) {
    db.close();
    return renderLayout('Groep niet gevonden', '<p>Groep niet gevonden.</p>', 'groups');
  }

  const directMembers = db.prepare(`
    SELECT member_name, member_type FROM memberships WHERE group_name = ? ORDER BY member_type, member_name
  `).all(name);

  const nestingPaths = db.prepare(`
    SELECT user_name, depth, path FROM effective_memberships WHERE group_name = ? AND depth > 0 ORDER BY depth DESC LIMIT 50
  `).all(name);

  let body = `
    <h1>${escapeHtml(name)}</h1>
    <table>
      <tr><td style="width:150px;color:#858585">Type</td><td>${escapeHtml(group.category)}</td></tr>
      <tr><td style="color:#858585">Scope</td><td>${escapeHtml(group.scope)}</td></tr>
      <tr><td style="color:#858585">Beschrijving</td><td>${escapeHtml(group.description)}</td></tr>
      <tr><td style="color:#858585">Eigenaar</td><td>${escapeHtml(group.managed_by)}</td></tr>
      <tr><td style="color:#858585">Aangemaakt</td><td>${escapeHtml(group.when_created)}</td></tr>
    </table>

    <h2>Directe leden (${directMembers.length})</h2>
    <table><tr><th>Naam</th><th>Type</th></tr>`;

  for (const m of directMembers) {
    const link = m.member_type === 'user'
      ? `<a href="/users?q=${encodeURIComponent(m.member_name)}">${escapeHtml(m.member_name)}</a>`
      : m.member_type === 'group'
        ? `<a href="/groups/detail?name=${encodeURIComponent(m.member_name)}">${escapeHtml(m.member_name)}</a>`
        : escapeHtml(m.member_name);
    body += `<tr><td>${link}</td><td>${escapeHtml(m.member_type)}</td></tr>`;
  }
  body += `</table>`;

  if (nestingPaths.length > 0) {
    body += `<h2>Geneste paden (${nestingPaths.length})</h2>
      <table><tr><th>Gebruiker</th><th>Diepte</th><th>Pad</th></tr>`;
    for (const p of nestingPaths) {
      body += `<tr><td>${escapeHtml(p.user_name)}</td><td>${p.depth}</td><td style="font-size:12px;color:#858585">${escapeHtml(p.path)}</td></tr>`;
    }
    body += `</table>`;
  }

  db.close();
  return renderLayout(name, body, 'groups');
}

module.exports = { render, renderDetail };
