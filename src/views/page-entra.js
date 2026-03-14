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
  const total = checks.length;

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

  db.close();
  return renderLayout('Entra ID Gereedheid', body, 'entra');
}

module.exports = { render };
