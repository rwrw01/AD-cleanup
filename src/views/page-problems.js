const { renderLayout, escapeHtml, severityBadge } = require('./layout');
const { getDatabase, getFindingsByCategory } = require('../database');

function render(query) {
  const db = getDatabase();
  const filterSeverity = query.severity || '';
  const filterCategory = query.category || '';

  let whereClause = '1=1';
  const params = [];
  if (filterSeverity) { whereClause += ' AND severity = ?'; params.push(filterSeverity); }
  if (filterCategory) { whereClause += ' AND category = ?'; params.push(filterCategory); }

  const findings = db.prepare(`
    SELECT severity, category, title, description, affected_object, affected_count, impact, recommendation, reference
    FROM findings WHERE ${whereClause}
    ORDER BY
      CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 END,
      affected_count DESC
  `).all(...params);

  const summary = getFindingsByCategory(db);

  // Tabs
  const severities = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const tabHtml = severities.map(s => {
    const label = s || 'Alles';
    const isActive = filterSeverity === s ? ' active' : '';
    return `<a href="/problems?severity=${s}&category=${escapeHtml(filterCategory)}" class="${isActive}">${label}</a>`;
  }).join('');

  let body = `
    <h1>Problemen (${findings.length})</h1>
    <div class="tab-bar">${tabHtml}</div>
    <table>
      <tr><th style="width:80px">Severity</th><th>Titel</th><th>Categorie</th><th style="width:70px">Aantal</th></tr>`;

  for (const f of findings) {
    body += `<tr>
      <td>${severityBadge(f.severity)}</td>
      <td>
        <strong>${escapeHtml(f.title)}</strong>
        <div style="font-size:12px;color:#858585;margin-top:2px">${escapeHtml(f.description)}</div>
        ${f.recommendation ? `<div style="font-size:12px;color:#4fc1ff;margin-top:2px">Aanbeveling: ${escapeHtml(f.recommendation)}</div>` : ''}
      </td>
      <td>${escapeHtml(f.category)}</td>
      <td>${f.affected_count}</td>
    </tr>`;
  }

  body += `</table>`;
  return renderLayout('Problemen', body, 'problems');
}

module.exports = { render };
