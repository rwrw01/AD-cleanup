function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function severityBadge(severity) {
  const colors = { CRITICAL: '#f44747', HIGH: '#f48771', MEDIUM: '#cca700', LOW: '#89d185' };
  const color = colors[severity] || '#858585';
  return `<span style="background:${color}; color:#1e1e1e; padding:1px 6px; border-radius:3px; font-size:11px; font-weight:600;">${escapeHtml(severity)}</span>`;
}

function statusBadge(status) {
  const colors = { FAIL: '#f44747', WARN: '#cca700', PASS: '#89d185', INFO: '#4fc1ff' };
  const color = colors[status] || '#858585';
  return `<span style="background:${color}; color:#1e1e1e; padding:1px 6px; border-radius:3px; font-size:11px; font-weight:600;">${escapeHtml(status)}</span>`;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { id: 'groups', label: 'Groepen', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'users', label: 'Gebruikers', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'problems', label: 'Problemen', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z' },
  { id: 'rbac', label: 'RBAC Voorstel', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'simulator', label: 'IST/SOLL', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  { id: 'entra', label: 'Entra ID', icon: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z' },
];

function renderLayout(title, body, activePage) {
  const page = activePage || 'dashboard';

  const navHtml = NAV_ITEMS.map(item => {
    const isActive = page === item.id ? ' active' : '';
    return `<a href="/${item.id}" class="${isActive}" title="${item.label}">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="${item.icon}"/></svg>
    </a>`;
  }).join('\n');

  const sideNavHtml = NAV_ITEMS.map(item => {
    const isActive = page === item.id ? ' active' : '';
    return `<a href="/${item.id}" class="${isActive}">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="${item.icon}"/></svg>
      ${item.label}
    </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} - AD Opschonen</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', -apple-system, sans-serif; background: #1e1e1e; color: #cccccc; line-height: 1.5; display: flex; height: 100vh; overflow: hidden; }

  .activity-bar { width: 48px; background: #333333; display: flex; flex-direction: column; align-items: center; padding-top: 4px; flex-shrink: 0; border-right: 1px solid #252526; }
  .activity-bar a { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; color: #858585; text-decoration: none; border-left: 2px solid transparent; }
  .activity-bar a:hover { color: #ffffff; }
  .activity-bar a.active { color: #ffffff; border-left-color: #ffffff; }
  .activity-bar a svg { width: 24px; height: 24px; }

  .sidebar { width: 220px; background: #252526; border-right: 1px solid #1e1e1e; display: flex; flex-direction: column; flex-shrink: 0; }
  .sidebar .panel-header { padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #bbbbbb; font-weight: 600; border-bottom: 1px solid #1e1e1e; }
  .sidebar a { display: flex; align-items: center; gap: 8px; padding: 5px 14px; color: #cccccc; text-decoration: none; font-size: 13px; }
  .sidebar a:hover { background: #2a2d2e; }
  .sidebar a.active { background: #37373d; color: #ffffff; }
  .sidebar a svg { width: 16px; height: 16px; flex-shrink: 0; }

  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .titlebar { background: #3c3c3c; padding: 6px 16px; font-size: 13px; color: #969696; border-bottom: 1px solid #252526; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .titlebar .page-title { color: #cccccc; font-weight: 500; }
  .container { flex: 1; overflow-y: auto; padding: 20px 24px; }

  h1 { margin-bottom: 12px; color: #e0e0e0; font-size: 20px; font-weight: 500; }
  h2 { margin: 20px 0 10px; color: #d4d4d4; font-size: 16px; font-weight: 500; }
  h3 { margin: 16px 0 8px; color: #d4d4d4; font-size: 14px; font-weight: 500; }
  a { color: #4fc1ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  p { margin: 8px 0; }

  table { width: 100%; border-collapse: collapse; background: #252526; margin-bottom: 20px; border: 1px solid #3c3c3c; }
  th, td { padding: 6px 12px; text-align: left; border-bottom: 1px solid #3c3c3c; font-size: 13px; }
  th { background: #2d2d2d; font-weight: 600; position: sticky; top: 0; color: #d4d4d4; }
  tr:hover { background: #2a2d2e; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .kpi-card { background: #252526; border: 1px solid #3c3c3c; border-radius: 4px; padding: 16px; }
  .kpi-card .label { font-size: 11px; text-transform: uppercase; color: #858585; letter-spacing: 0.5px; }
  .kpi-card .value { font-size: 28px; font-weight: 300; color: #4fc1ff; margin-top: 4px; }
  .kpi-card .value.critical { color: #f44747; }
  .kpi-card .value.warning { color: #cca700; }
  .kpi-card .value.good { color: #89d185; }

  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; }
  .badge-critical { background: #f44747; color: #1e1e1e; }
  .badge-high { background: #f48771; color: #1e1e1e; }
  .badge-medium { background: #cca700; color: #1e1e1e; }
  .badge-low { background: #89d185; color: #1e1e1e; }

  .depth-bar { display: inline-block; height: 8px; background: #4fc1ff; border-radius: 2px; min-width: 4px; }
  .depth-bar.deep { background: #f48771; }
  .depth-bar.critical { background: #f44747; }

  .change-add { color: #89d185; }
  .change-remove { color: #f44747; }
  .change-keep { color: #858585; }

  .search-box { background: #3c3c3c; border: 1px solid #555; color: #cccccc; padding: 4px 10px; font-size: 13px; border-radius: 3px; width: 300px; margin-bottom: 16px; }
  .search-box:focus { outline: none; border-color: #007acc; }

  .tab-bar { display: flex; gap: 0; border-bottom: 1px solid #3c3c3c; margin-bottom: 16px; }
  .tab-bar a { padding: 8px 16px; color: #858585; text-decoration: none; border-bottom: 2px solid transparent; font-size: 13px; }
  .tab-bar a:hover { color: #cccccc; }
  .tab-bar a.active { color: #ffffff; border-bottom-color: #4fc1ff; }
</style>
</head>
<body>
  <div class="activity-bar">
    ${navHtml}
  </div>
  <div class="sidebar">
    <div class="panel-header">AD Opschonen</div>
    <div style="padding: 4px 0;">
      ${sideNavHtml}
    </div>
  </div>
  <div class="main">
    <div class="titlebar">
      <span class="page-title">${escapeHtml(title)}</span>
    </div>
    <div class="container">
      ${body}
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderLayout, escapeHtml, severityBadge, statusBadge };
