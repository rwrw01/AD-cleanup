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

  // Get bundle data
  const bundles = db.prepare('SELECT id, bundle_name, group_count FROM app_bundles ORDER BY group_count DESC').all();
  const bundleRoleMap = {};
  const bundleRoles = db.prepare('SELECT bundle_id, role_id FROM app_bundle_roles').all();
  for (const br of bundleRoles) {
    if (!bundleRoleMap[br.role_id]) bundleRoleMap[br.role_id] = [];
    bundleRoleMap[br.role_id].push(br.bundle_id);
  }
  const bundleById = {};
  for (const b of bundles) bundleById[b.id] = b;

  // AGDLP stats
  const agdlpCount = db.prepare('SELECT COUNT(*) as c FROM agdlp_proposals').get().c;
  const nestCount = db.prepare("SELECT COUNT(*) as c FROM agdlp_proposals WHERE proposed_type = 'NestVoorstel'").get().c;
  const renameCount = db.prepare("SELECT COUNT(*) as c FROM agdlp_proposals WHERE proposed_type = 'DomainLocal' AND current_group != proposed_name").get().c;

  const tabHtml = ['', 'basis', 'afdeling'].map(l => {
    const label = l === '' ? 'Alles' : l === 'basis' ? 'Basisrollen' : 'Afdelingsrollen';
    const isActive = filterLayer === l ? ' active' : '';
    return `<a href="/rbac?layer=${l}" class="${isActive}">${label}</a>`;
  }).join('');

  let body = `
    <h1>RBAC Voorstel (${roles.length} rollen)</h1>
    <p style="color:#858585;margin-bottom:16px">Functie-eerst model met applicatiebundels en AGDLP-structuur.</p>`;

  // Bundles summary
  if (bundles.length > 0) {
    body += `
    <h2>Applicatiebundels (${bundles.length})</h2>
    <p style="color:#858585;margin-bottom:8px">Groepen die in >80% van de rollen samen voorkomen, gebundeld tot sets die in 1x worden toegekend.</p>
    <table>
      <tr><th>Bundel</th><th>Groepen</th><th>Gekoppelde rollen</th></tr>`;
    for (const b of bundles) {
      const linkedRoles = bundleRoles.filter(br => br.bundle_id === b.id);
      const roleNames = linkedRoles.map(br => {
        const role = roles.find(r => r.id === br.role_id);
        return role ? role.role_name : '?';
      }).filter(n => n !== '?');
      body += `<tr>
        <td><a href="/rbac/bundle?id=${b.id}">${escapeHtml(b.bundle_name)}</a></td>
        <td>${b.group_count}</td>
        <td style="font-size:12px">${roleNames.length > 0 ? roleNames.slice(0, 5).map(n => escapeHtml(n)).join(', ') + (roleNames.length > 5 ? ` (+${roleNames.length - 5})` : '') : '-'}</td>
      </tr>`;
    }
    body += `</table>`;
  }

  // AGDLP summary
  if (agdlpCount > 0) {
    body += `
    <h2>AGDLP-structuur</h2>
    <p style="color:#858585;margin-bottom:8px">Voorstel conform Microsoft AGDLP best practice: Users → Global Groups (rollen) → Domain Local Groups (resources) → Permissions.</p>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">Totaal voorstellen</div><div class="value">${agdlpCount}</div></div>
      <div class="kpi-card"><div class="label">Nestkoppelingen</div><div class="value">${nestCount}</div></div>
      <div class="kpi-card"><div class="label">Hernoemingen</div><div class="value ${renameCount > 0 ? 'warning' : 'good'}">${renameCount}</div></div>
    </div>
    <p style="margin-top:8px"><a href="/rbac/agdlp">Bekijk alle AGDLP-voorstellen →</a></p>`;
  }

  // Roles table
  body += `
    <h2>Rollen</h2>
    <div class="tab-bar">${tabHtml}</div>
    <table>
      <tr><th>Rol</th><th>Laag</th><th>Functie</th><th>Afdeling</th><th>Users</th><th>Groepen</th><th>Bundels</th></tr>`;

  for (const r of roles) {
    const layerColor = r.role_layer === 'basis' ? '#4fc1ff' : '#cca700';
    const roleBundles = bundleRoleMap[r.id] || [];
    const bundleNames = roleBundles.map(bid => bundleById[bid] ? bundleById[bid].bundle_name : '?').filter(n => n !== '?');
    body += `<tr>
      <td><a href="/rbac/detail?id=${r.id}">${escapeHtml(r.role_name)}</a></td>
      <td><span style="color:${layerColor}">${escapeHtml(r.role_layer)}</span></td>
      <td>${escapeHtml(r.function_title)}</td>
      <td>${escapeHtml(r.department || '-')}</td>
      <td>${r.user_count}</td>
      <td>${r.group_count}</td>
      <td style="font-size:12px">${bundleNames.length > 0 ? bundleNames.map(n => escapeHtml(n)).join(', ') : '-'}</td>
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

  // Get bundles for this role
  const roleBundles = db.prepare(`
    SELECT ab.id, ab.bundle_name, ab.group_count FROM app_bundle_roles abr
    JOIN app_bundles ab ON ab.id = abr.bundle_id
    WHERE abr.role_id = ?
  `).all(id);

  // Get dynamic rule for this role
  const dynRule = db.prepare('SELECT group_name, membership_rule, description FROM entra_dynamic_rules WHERE role_id = ?').get(id);

  // Get access package for this role
  const accessPkg = db.prepare('SELECT package_name, auto_assignment_rule, resources FROM entra_access_packages WHERE role_id = ?').get(id);

  let body = `
    <h1>${escapeHtml(role.role_name)}</h1>
    <table>
      <tr><td style="width:150px;color:#858585">Laag</td><td>${escapeHtml(role.role_layer)}</td></tr>
      <tr><td style="color:#858585">Functie</td><td>${escapeHtml(role.function_title)}</td></tr>
      <tr><td style="color:#858585">Afdeling</td><td>${escapeHtml(role.department || 'Alle')}</td></tr>
      <tr><td style="color:#858585">Beschrijving</td><td>${escapeHtml(role.description)}</td></tr>
    </table>`;

  // Application bundles section
  if (roleBundles.length > 0) {
    body += `<h2>Applicatiebundels (${roleBundles.length})</h2>
    <p style="color:#858585;margin-bottom:8px">Deze bundels worden in 1x toegekend aan gebruikers met deze rol.</p>
    <table><tr><th>Bundel</th><th>Groepen in bundel</th></tr>`;
    for (const b of roleBundles) {
      body += `<tr><td><a href="/rbac/bundle?id=${b.id}">${escapeHtml(b.bundle_name)}</a></td><td>${b.group_count}</td></tr>`;
    }
    body += `</table>`;
  }

  // Entra proposals section
  if (dynRule || accessPkg) {
    body += `<h2>Entra ID Voorstellen</h2>`;
    if (dynRule) {
      body += `
      <div class="code-block">
        <div style="color:#858585;font-size:11px;margin-bottom:4px">Dynamic Group: ${escapeHtml(dynRule.group_name)}</div>
        <code>${escapeHtml(dynRule.membership_rule)}</code>
      </div>`;
    }
    if (accessPkg) {
      body += `
      <div class="code-block" style="margin-top:8px">
        <div style="color:#858585;font-size:11px;margin-bottom:4px">Access Package: ${escapeHtml(accessPkg.package_name)}</div>
        ${accessPkg.auto_assignment_rule ? `<div style="margin-bottom:4px"><span style="color:#858585">Auto-assignment:</span> <code>${escapeHtml(accessPkg.auto_assignment_rule)}</code></div>` : ''}
      </div>`;
    }
  }

  body += `
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

function renderBundle(query) {
  const db = getDatabase();
  const id = parseInt(query.id, 10);

  const bundle = db.prepare('SELECT * FROM app_bundles WHERE id = ?').get(id);
  if (!bundle) {
    db.close();
    return renderLayout('Bundel niet gevonden', '<p>Bundel niet gevonden.</p>', 'rbac');
  }

  const groups = db.prepare('SELECT group_name FROM app_bundle_groups WHERE bundle_id = ? ORDER BY group_name').all(id);
  const linkedRoles = db.prepare(`
    SELECT pr.id, pr.role_name, pr.role_layer, pr.user_count
    FROM app_bundle_roles abr
    JOIN proposed_roles pr ON pr.id = abr.role_id
    WHERE abr.bundle_id = ?
    ORDER BY pr.role_name
  `).all(id);

  let body = `
    <h1>${escapeHtml(bundle.bundle_name)}</h1>
    <p style="color:#858585">${escapeHtml(bundle.description || '')}</p>

    <h2>Groepen in deze bundel (${groups.length})</h2>
    <p style="color:#858585;margin-bottom:8px">Deze groepen worden altijd samen toegekend — in plaats van ${groups.length} losse koppelingen is dit 1 bundel.</p>
    <table><tr><th>Groep</th></tr>`;
  for (const g of groups) {
    body += `<tr><td><a href="/groups/detail?name=${encodeURIComponent(g.group_name)}">${escapeHtml(g.group_name)}</a></td></tr>`;
  }
  body += `</table>

    <h2>Gekoppelde rollen (${linkedRoles.length})</h2>
    <table><tr><th>Rol</th><th>Laag</th><th>Users</th></tr>`;
  for (const r of linkedRoles) {
    const layerColor = r.role_layer === 'basis' ? '#4fc1ff' : '#cca700';
    body += `<tr>
      <td><a href="/rbac/detail?id=${r.id}">${escapeHtml(r.role_name)}</a></td>
      <td><span style="color:${layerColor}">${escapeHtml(r.role_layer)}</span></td>
      <td>${r.user_count}</td>
    </tr>`;
  }
  body += `</table>`;

  db.close();
  return renderLayout(bundle.bundle_name, body, 'rbac');
}

function renderAGDLP() {
  const db = getDatabase();

  const proposals = db.prepare(`
    SELECT current_group, proposed_name, proposed_type, proposed_scope, nests_in, description
    FROM agdlp_proposals ORDER BY proposed_type, current_group
  `).all();

  const globalGroups = proposals.filter(p => p.proposed_type === 'Global');
  const domainLocal = proposals.filter(p => p.proposed_type === 'DomainLocal');
  const nestings = proposals.filter(p => p.proposed_type === 'NestVoorstel');

  let body = `
    <h1>AGDLP-structuur Voorstel</h1>
    <p style="color:#858585;margin-bottom:16px">Microsoft best practice: Accounts → Global Groups (GG-) → Domain Local Groups (DL-) → Permissions.<br>
    Eén niveau nesting (GG in DL), compatible met Entra ID.</p>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">Global Groups (rollen)</div><div class="value">${globalGroups.length}</div></div>
      <div class="kpi-card"><div class="label">Domain Local (resources)</div><div class="value">${domainLocal.length}</div></div>
      <div class="kpi-card"><div class="label">Nestkoppelingen</div><div class="value">${nestings.length}</div></div>
    </div>`;

  if (globalGroups.length > 0) {
    body += `
    <h2>Global Groups — Rolgroepen (${globalGroups.length})</h2>
    <p style="color:#858585;margin-bottom:8px">Bevatten gebruikers. Hernoem ROL- naar GG- prefix.</p>
    <table><tr><th>Huidig</th><th>Voorstel</th><th>Toelichting</th></tr>`;
    for (const p of globalGroups) {
      body += `<tr><td>${escapeHtml(p.current_group)}</td><td><strong>${escapeHtml(p.proposed_name)}</strong></td><td style="font-size:12px;color:#858585">${escapeHtml(p.description)}</td></tr>`;
    }
    body += `</table>`;
  }

  if (domainLocal.length > 0) {
    body += `
    <h2>Domain Local Groups — Resourcegroepen (${domainLocal.length})</h2>
    <p style="color:#858585;margin-bottom:8px">Krijgen permissions. Hernoem naar DL- prefix, scope instellen op DomainLocal.</p>
    <table><tr><th>Huidig</th><th>Voorstel</th><th>Scope</th></tr>`;
    for (const p of domainLocal) {
      body += `<tr><td>${escapeHtml(p.current_group)}</td><td><strong>${escapeHtml(p.proposed_name)}</strong></td><td>${escapeHtml(p.proposed_scope)}</td></tr>`;
    }
    body += `</table>`;
  }

  if (nestings.length > 0) {
    body += `
    <h2>Nestkoppelingen (${nestings.length})</h2>
    <p style="color:#858585;margin-bottom:8px">GG-groep nesten in DL-groep voor resourcetoegang.</p>
    <table><tr><th>Global Group</th><th style="width:30px;text-align:center">→</th><th>Domain Local Group</th></tr>`;
    for (const p of nestings) {
      body += `<tr><td>${escapeHtml(p.current_group)}</td><td style="text-align:center;color:#4fc1ff">→</td><td>${escapeHtml(p.nests_in)}</td></tr>`;
    }
    body += `</table>`;
  }

  if (proposals.length === 0) {
    body += `<p style="color:#858585">Geen AGDLP-voorstellen. Draai eerst: <code>npm run rbac</code></p>`;
  }

  db.close();
  return renderLayout('AGDLP Voorstel', body, 'rbac');
}

module.exports = { render, renderDetail, renderBundle, renderAGDLP };
