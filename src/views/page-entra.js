const { renderLayout, escapeHtml, statusBadge } = require('./layout');
const { getDatabase } = require('../database');

function render() {
  const db = getDatabase();

  const checks = db.prepare(`
    SELECT check_name, status, severity, affected_count, details
    FROM entra_checks ORDER BY
      CASE status WHEN 'FAIL' THEN 1 WHEN 'WARN' THEN 2 WHEN 'INFO' THEN 3 WHEN 'PASS' THEN 4 END
  `).all();

  const failCount = checks.filter(c => c.status === 'FAIL').length;
  const warnCount = checks.filter(c => c.status === 'WARN').length;
  const passCount = checks.filter(c => c.status === 'PASS').length;

  let readinessClass = 'critical';
  let readinessText = 'GEBLOKKEERD';
  if (failCount === 0 && warnCount === 0) { readinessClass = 'good'; readinessText = 'GEREED'; }
  else if (failCount === 0) { readinessClass = 'warning'; readinessText = 'MOGELIJK'; }

  let body = `
    <h1>Entra ID Gereedheid</h1>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">Status</div><div class="value ${readinessClass}">${readinessText}</div></div>
      <div class="kpi-card"><div class="label">OK</div><div class="value good">${passCount}</div></div>
      <div class="kpi-card"><div class="label">Waarschuwingen</div><div class="value ${warnCount > 0 ? 'warning' : 'good'}">${warnCount}</div></div>
      <div class="kpi-card"><div class="label">Blokkerend</div><div class="value ${failCount > 0 ? 'critical' : 'good'}">${failCount}</div></div>
    </div>

    <table>
      <tr><th style="width:70px">Status</th><th>Check</th><th style="width:80px">Aantal</th><th>Details</th></tr>`;

  for (const c of checks) {
    body += `<tr>
      <td>${statusBadge(c.status)}</td>
      <td><strong>${escapeHtml(c.check_name)}</strong></td>
      <td>${c.affected_count > 0 ? c.affected_count : '-'}</td>
      <td style="font-size:12px;color:#858585">${escapeHtml(c.details)}</td>
    </tr>`;
  }

  body += `</table>`;

  if (checks.length === 0) {
    body += `<p style="color:#858585">Geen Entra ID checks uitgevoerd. Draai eerst: <code>npm run entra</code></p>`;
  }

  // Dynamic Group Rules section
  const dynRules = db.prepare(`
    SELECT edr.group_name, edr.membership_rule, edr.description, pr.role_name
    FROM entra_dynamic_rules edr
    LEFT JOIN proposed_roles pr ON pr.id = edr.role_id
    ORDER BY edr.group_name
  `).all();

  if (dynRules.length > 0) {
    body += `
    <h2>Dynamic Group Regels (${dynRules.length})</h2>
    <p style="color:#858585;margin-bottom:8px">Entra ID dynamic membership rules — groepslidmaatschap automatisch op basis van user-attributen. Kopieer de regel naar Entra ID &gt; Groups &gt; New group &gt; Dynamic user.</p>
    <table>
      <tr><th>Groep</th><th>Rol</th><th>Membership Rule</th></tr>`;

    for (const r of dynRules) {
      body += `<tr>
        <td>${escapeHtml(r.group_name)}</td>
        <td style="font-size:12px">${escapeHtml(r.role_name || '-')}</td>
        <td><code style="background:#2d2d2d;padding:2px 6px;border-radius:3px;font-size:12px">${escapeHtml(r.membership_rule)}</code></td>
      </tr>`;
    }
    body += `</table>`;
  }

  // Access Packages section
  const packages = db.prepare(`
    SELECT eap.package_name, eap.auto_assignment_rule, eap.resources, pr.role_name
    FROM entra_access_packages eap
    LEFT JOIN proposed_roles pr ON pr.id = eap.role_id
    ORDER BY eap.package_name
  `).all();

  if (packages.length > 0) {
    body += `
    <h2>Access Package Voorstellen (${packages.length})</h2>
    <p style="color:#858585;margin-bottom:8px">Entra ID Governance Access Packages — bundel groepen en applicaties tot één toewijsbaar pakket per rol. Maak aan via Entra ID &gt; Identity Governance &gt; Entitlement management.</p>
    <table>
      <tr><th>Package</th><th>Rol</th><th>Auto-assignment</th><th>Resources</th></tr>`;

    for (const p of packages) {
      let resourceSummary = '-';
      try {
        const res = JSON.parse(p.resources);
        const parts = [];
        if (res.groups && res.groups.length > 0) parts.push(`${res.groups.length} groepen`);
        if (res.bundles && res.bundles.length > 0) parts.push(`${res.bundles.length} bundels`);
        resourceSummary = parts.join(', ') || '-';
      } catch (e) { /* ignore */ }

      body += `<tr>
        <td><strong>${escapeHtml(p.package_name)}</strong></td>
        <td style="font-size:12px">${escapeHtml(p.role_name || '-')}</td>
        <td>${p.auto_assignment_rule ? `<code style="background:#2d2d2d;padding:2px 6px;border-radius:3px;font-size:12px">${escapeHtml(p.auto_assignment_rule)}</code>` : '-'}</td>
        <td style="font-size:12px">${resourceSummary}</td>
      </tr>`;
    }
    body += `</table>`;
  }

  db.close();
  return renderLayout('Entra ID Gereedheid', body, 'entra');
}

module.exports = { render };
