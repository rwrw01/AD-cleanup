const { renderLayout, escapeHtml } = require('./layout');
const { getDatabase } = require('../database');

function render(query) {
  const db = getDatabase();
  const search = query.q || '';

  let users;
  if (search) {
    users = db.prepare(`
      SELECT u.sam_account_name, u.display_name, u.department, u.title, u.enabled, u.last_logon,
             COALESCE(g.group_count, 0) as group_count
      FROM users u
      LEFT JOIN (SELECT user_name, COUNT(*) as group_count FROM effective_memberships GROUP BY user_name) g
        ON u.sam_account_name = g.user_name
      WHERE u.sam_account_name LIKE ? OR u.display_name LIKE ? OR u.department LIKE ? OR u.title LIKE ?
      ORDER BY g.group_count DESC
      LIMIT 500
    `).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  } else {
    users = db.prepare(`
      SELECT u.sam_account_name, u.display_name, u.department, u.title, u.enabled, u.last_logon,
             COALESCE(g.group_count, 0) as group_count
      FROM users u
      LEFT JOIN (SELECT user_name, COUNT(*) as group_count FROM effective_memberships GROUP BY user_name) g
        ON u.sam_account_name = g.user_name
      ORDER BY g.group_count DESC
      LIMIT 500
    `).all();
  }

  let body = `
    <h1>Gebruikers (${users.length}${users.length >= 500 ? '+' : ''})</h1>
    <input class="search-box" type="text" placeholder="Zoek gebruiker, afdeling, functie..." value="${escapeHtml(search)}"
      onkeyup="if(event.key==='Enter')location.href='/users?q='+encodeURIComponent(this.value)">
    <table>
      <tr><th>Account</th><th>Naam</th><th>Afdeling</th><th>Functie</th><th>Status</th><th>Groepen</th><th>Laatste login</th></tr>`;

  for (const u of users) {
    const statusColor = u.enabled ? '#89d185' : '#f44747';
    const statusText = u.enabled ? 'Actief' : 'Disabled';
    body += `<tr>
      <td><a href="/users/detail?name=${encodeURIComponent(u.sam_account_name)}">${escapeHtml(u.sam_account_name)}</a></td>
      <td>${escapeHtml(u.display_name)}</td>
      <td>${escapeHtml(u.department)}</td>
      <td>${escapeHtml(u.title)}</td>
      <td><span style="color:${statusColor}">${statusText}</span></td>
      <td>${u.group_count}</td>
      <td style="font-size:12px">${escapeHtml(u.last_logon)}</td>
    </tr>`;
  }

  body += `</table>`;
  return renderLayout('Gebruikers', body, 'users');
}

function renderDetail(query) {
  const db = getDatabase();
  const name = query.name || '';

  const user = db.prepare('SELECT * FROM users WHERE sam_account_name = ?').get(name);
  if (!user) {
    return renderLayout('Gebruiker niet gevonden', '<p>Gebruiker niet gevonden.</p>', 'users');
  }

  const memberships = db.prepare(`
    SELECT group_name, depth, path FROM effective_memberships WHERE user_name = ? ORDER BY depth, group_name
  `).all(name);

  const directGroups = memberships.filter(m => m.depth === 0);
  const inheritedGroups = memberships.filter(m => m.depth > 0);

  let body = `
    <h1>${escapeHtml(user.display_name || user.sam_account_name)}</h1>
    <table>
      <tr><td style="width:180px;color:#858585">Account</td><td>${escapeHtml(user.sam_account_name)}</td></tr>
      <tr><td style="color:#858585">E-mail</td><td>${escapeHtml(user.email)}</td></tr>
      <tr><td style="color:#858585">Afdeling</td><td>${escapeHtml(user.department)}</td></tr>
      <tr><td style="color:#858585">Functie</td><td>${escapeHtml(user.title)}</td></tr>
      <tr><td style="color:#858585">Manager</td><td>${escapeHtml(user.manager_sam)}</td></tr>
      <tr><td style="color:#858585">Status</td><td>${user.enabled ? '<span style="color:#89d185">Actief</span>' : '<span style="color:#f44747">Disabled</span>'}</td></tr>
      <tr><td style="color:#858585">Laatste login</td><td>${escapeHtml(user.last_logon)}</td></tr>
      <tr><td style="color:#858585">Wachtwoord gewijzigd</td><td>${escapeHtml(user.password_last_set)}</td></tr>
      <tr><td style="color:#858585">Wachtwoord verloopt nooit</td><td>${user.password_never_expires ? '<span style="color:#f44747">Ja</span>' : 'Nee'}</td></tr>
      <tr><td style="color:#858585">UPN</td><td>${escapeHtml(user.upn)}</td></tr>
      <tr><td style="color:#858585">OU</td><td style="font-size:12px">${escapeHtml(user.ou_path)}</td></tr>
    </table>

    <h2>Directe groepen (${directGroups.length})</h2>
    <table><tr><th>Groep</th></tr>`;
  for (const g of directGroups) {
    body += `<tr><td><a href="/groups/detail?name=${encodeURIComponent(g.group_name)}">${escapeHtml(g.group_name)}</a></td></tr>`;
  }
  body += `</table>`;

  if (inheritedGroups.length > 0) {
    body += `<h2>Geerfde groepen via nesting (${inheritedGroups.length})</h2>
      <table><tr><th>Groep</th><th>Diepte</th><th>Pad</th></tr>`;
    for (const g of inheritedGroups) {
      body += `<tr>
        <td><a href="/groups/detail?name=${encodeURIComponent(g.group_name)}">${escapeHtml(g.group_name)}</a></td>
        <td>${g.depth}</td>
        <td style="font-size:12px;color:#858585">${escapeHtml(g.path)}</td>
      </tr>`;
    }
    body += `</table>`;
  }

  return renderLayout(user.display_name || user.sam_account_name, body, 'users');
}

module.exports = { render, renderDetail };
