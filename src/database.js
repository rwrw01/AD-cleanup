const path = require('path');
const fs = require('fs');

const isPackaged = typeof process.pkg !== 'undefined';
const BASE_DIR = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');

const DATA_DIR = path.join(BASE_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'ad-analysis.db');

let SQL = null;

async function initEngine() {
  if (SQL) return;
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
}

class PreparedStatement {
  constructor(wrapper, sql) {
    this._wrapper = wrapper;
    this._sql = sql;
  }

  _bindParams(params) {
    if (!params || params.length === 0) return undefined;
    return params;
  }

  get(...params) {
    const db = this._wrapper._db;
    let stmt;
    try {
      stmt = db.prepare(this._sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      if (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        const row = {};
        for (let i = 0; i < columns.length; i++) {
          row[columns[i]] = values[i];
        }
        return row;
      }
      return undefined;
    } finally {
      if (stmt) stmt.free();
    }
  }

  all(...params) {
    const db = this._wrapper._db;
    let stmt;
    try {
      stmt = db.prepare(this._sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      const results = [];
      while (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        const row = {};
        for (let i = 0; i < columns.length; i++) {
          row[columns[i]] = values[i];
        }
        results.push(row);
      }
      return results;
    } finally {
      if (stmt) stmt.free();
    }
  }

  run(...params) {
    const db = this._wrapper._db;
    db.run(this._sql, params);
    this._wrapper._dirty = true;

    const lastIdResult = db.exec('SELECT last_insert_rowid()');
    const lastInsertRowid = lastIdResult.length > 0 ? lastIdResult[0].values[0][0] : 0;
    const changes = db.getRowsModified();

    return { lastInsertRowid, changes };
  }
}

class DatabaseWrapper {
  constructor(dbPath) {
    if (!SQL) {
      throw new Error('sql.js engine not initialized. Call initEngine() first.');
    }
    this._dbPath = dbPath;
    this._dirty = false;

    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      this._db = new SQL.Database(buffer);
    } else {
      this._db = new SQL.Database();
    }
  }

  prepare(sql) {
    return new PreparedStatement(this, sql);
  }

  exec(multiStatementSQL) {
    this._db.exec(multiStatementSQL);
    this._dirty = true;
  }

  transaction(fn) {
    const self = this;
    return function (...args) {
      self._db.run('BEGIN');
      try {
        const result = fn(...args);
        self._db.run('COMMIT');
        self._dirty = true;
        return result;
      } catch (err) {
        self._db.run('ROLLBACK');
        throw err;
      }
    };
  }

  pragma(str) {
    const sql = `PRAGMA ${str}`;
    const result = this._db.exec(sql);
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0];
    }
    return undefined;
  }

  close() {
    if (this._dirty) {
      const data = this._db.export();
      const buffer = Buffer.from(data);
      fs.mkdirSync(path.dirname(this._dbPath), { recursive: true });
      fs.writeFileSync(this._dbPath, buffer);
    }
    this._db.close();
  }
}

function initDatabase() {
  fs.mkdirSync(path.join(DATA_DIR, 'imports'), { recursive: true });

  const db = new DatabaseWrapper(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sam_account_name TEXT UNIQUE NOT NULL,
      display_name TEXT,
      email TEXT,
      department TEXT,
      title TEXT,
      manager_sam TEXT,
      enabled INTEGER,
      last_logon TEXT,
      password_last_set TEXT,
      password_never_expires INTEGER DEFAULT 0,
      distinguished_name TEXT,
      employee_id TEXT,
      employee_type TEXT,
      when_created TEXT,
      ou_path TEXT,
      upn TEXT,
      locked_out INTEGER DEFAULT 0,
      account_expiration TEXT,
      description TEXT,
      imported_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      sam_account_name TEXT,
      category TEXT,
      scope TEXT,
      description TEXT,
      distinguished_name TEXT,
      managed_by TEXT,
      member_count INTEGER DEFAULT 0,
      when_created TEXT,
      when_changed TEXT,
      imported_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT NOT NULL,
      member_name TEXT NOT NULL,
      member_type TEXT,
      member_dn TEXT,
      group_dn TEXT,
      UNIQUE(group_name, member_name)
    );

    CREATE TABLE IF NOT EXISTS ous (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      distinguished_name TEXT UNIQUE,
      description TEXT,
      depth INTEGER,
      when_created TEXT
    );

    CREATE TABLE IF NOT EXISTS service_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sam_account_name TEXT UNIQUE,
      spns TEXT,
      password_last_set TEXT,
      last_logon TEXT,
      enabled INTEGER,
      description TEXT,
      when_created TEXT
    );

    CREATE TABLE IF NOT EXISTS effective_memberships (
      user_name TEXT NOT NULL,
      group_name TEXT NOT NULL,
      depth INTEGER DEFAULT 0,
      path TEXT,
      PRIMARY KEY(user_name, group_name)
    );

    CREATE TABLE IF NOT EXISTS findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      affected_object TEXT,
      affected_count INTEGER DEFAULT 1,
      impact TEXT,
      recommendation TEXT,
      reference TEXT
    );

    CREATE TABLE IF NOT EXISTS proposed_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_name TEXT NOT NULL,
      role_layer TEXT,
      function_title TEXT,
      department TEXT,
      description TEXT,
      source_pattern TEXT,
      user_count INTEGER DEFAULT 0,
      group_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS proposed_role_groups (
      role_id INTEGER NOT NULL,
      group_name TEXT NOT NULL,
      FOREIGN KEY(role_id) REFERENCES proposed_roles(id),
      UNIQUE(role_id, group_name)
    );

    CREATE TABLE IF NOT EXISTS proposed_role_users (
      role_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      is_outlier INTEGER DEFAULT 0,
      FOREIGN KEY(role_id) REFERENCES proposed_roles(id),
      UNIQUE(role_id, user_name)
    );

    CREATE TABLE IF NOT EXISTS import_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imported_at TEXT DEFAULT (datetime('now')),
      file_count INTEGER DEFAULT 0,
      user_count INTEGER DEFAULT 0,
      group_count INTEGER DEFAULT 0,
      membership_count INTEGER DEFAULT 0,
      ou_count INTEGER DEFAULT 0,
      service_account_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS simulation_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name TEXT NOT NULL,
      change_type TEXT NOT NULL,
      group_name TEXT NOT NULL,
      role_name TEXT,
      risk_level TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS entra_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_name TEXT NOT NULL,
      status TEXT NOT NULL,
      severity TEXT,
      affected_count INTEGER DEFAULT 0,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS app_bundles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bundle_name TEXT NOT NULL,
      description TEXT,
      group_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_bundle_groups (
      bundle_id INTEGER NOT NULL,
      group_name TEXT NOT NULL,
      FOREIGN KEY(bundle_id) REFERENCES app_bundles(id),
      UNIQUE(bundle_id, group_name)
    );

    CREATE TABLE IF NOT EXISTS app_bundle_roles (
      bundle_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      FOREIGN KEY(bundle_id) REFERENCES app_bundles(id),
      FOREIGN KEY(role_id) REFERENCES proposed_roles(id),
      UNIQUE(bundle_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS entra_access_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_name TEXT NOT NULL,
      role_id INTEGER,
      auto_assignment_rule TEXT,
      resources TEXT,
      FOREIGN KEY(role_id) REFERENCES proposed_roles(id)
    );

    CREATE TABLE IF NOT EXISTS entra_dynamic_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER,
      group_name TEXT NOT NULL,
      membership_rule TEXT NOT NULL,
      description TEXT,
      FOREIGN KEY(role_id) REFERENCES proposed_roles(id)
    );

    CREATE TABLE IF NOT EXISTS agdlp_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      current_group TEXT NOT NULL,
      proposed_name TEXT,
      proposed_type TEXT,
      proposed_scope TEXT,
      nests_in TEXT,
      description TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
    CREATE INDEX IF NOT EXISTS idx_users_title ON users(title);
    CREATE INDEX IF NOT EXISTS idx_users_enabled ON users(enabled);
    CREATE INDEX IF NOT EXISTS idx_users_sam ON users(sam_account_name);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_upn ON users(upn);
    CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_sam);
    CREATE INDEX IF NOT EXISTS idx_users_dept_title ON users(department, title);
    CREATE INDEX IF NOT EXISTS idx_users_enabled_title ON users(enabled, title);
    CREATE INDEX IF NOT EXISTS idx_memberships_group ON memberships(group_name);
    CREATE INDEX IF NOT EXISTS idx_memberships_member ON memberships(member_name);
    CREATE INDEX IF NOT EXISTS idx_memberships_type ON memberships(member_type);
    CREATE INDEX IF NOT EXISTS idx_memberships_group_type ON memberships(group_name, member_type);
    CREATE INDEX IF NOT EXISTS idx_memberships_member_type ON memberships(member_name, member_type);
    CREATE INDEX IF NOT EXISTS idx_effective_user ON effective_memberships(user_name);
    CREATE INDEX IF NOT EXISTS idx_effective_group ON effective_memberships(group_name);
    CREATE INDEX IF NOT EXISTS idx_effective_depth ON effective_memberships(depth);
    CREATE INDEX IF NOT EXISTS idx_effective_user_group ON effective_memberships(user_name, group_name);
    CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
    CREATE INDEX IF NOT EXISTS idx_findings_category ON findings(category);
    CREATE INDEX IF NOT EXISTS idx_proposed_roles_layer ON proposed_roles(role_layer);
    CREATE INDEX IF NOT EXISTS idx_proposed_role_groups_role ON proposed_role_groups(role_id);
    CREATE INDEX IF NOT EXISTS idx_proposed_role_groups_group ON proposed_role_groups(group_name);
    CREATE INDEX IF NOT EXISTS idx_proposed_role_users_role ON proposed_role_users(role_id);
    CREATE INDEX IF NOT EXISTS idx_proposed_role_users_user ON proposed_role_users(user_name);
    CREATE INDEX IF NOT EXISTS idx_simulation_user ON simulation_results(user_name);
    CREATE INDEX IF NOT EXISTS idx_simulation_type ON simulation_results(change_type);
    CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
    CREATE INDEX IF NOT EXISTS idx_app_bundle_groups_bundle ON app_bundle_groups(bundle_id);
    CREATE INDEX IF NOT EXISTS idx_app_bundle_roles_role ON app_bundle_roles(role_id);
    CREATE INDEX IF NOT EXISTS idx_agdlp_type ON agdlp_proposals(proposed_type);
  `);

  return db;
}

let _singleton = null;

function getDatabase() {
  if (_singleton) return _singleton;
  _singleton = initDatabase();
  return _singleton;
}

function closeDatabase() {
  if (_singleton) {
    _singleton.close();
    _singleton = null;
  }
}

function resetDatabase() {
  _singleton = null;
}

function clearAnalysisData(db) {
  db.exec(`
    DELETE FROM app_bundle_groups;
    DELETE FROM app_bundle_roles;
    DELETE FROM entra_access_packages;
    DELETE FROM entra_dynamic_rules;
    DELETE FROM proposed_role_users;
    DELETE FROM proposed_role_groups;
    DELETE FROM app_bundles;
    DELETE FROM proposed_roles;
    DELETE FROM effective_memberships;
    DELETE FROM findings;
    DELETE FROM simulation_results;
    DELETE FROM entra_checks;
    DELETE FROM agdlp_proposals;
  `);
}

function clearImportData(db) {
  db.exec(`
    DELETE FROM users;
    DELETE FROM groups;
    DELETE FROM memberships;
    DELETE FROM ous;
    DELETE FROM service_accounts;
  `);
  clearAnalysisData(db);
}

function getStats(db) {
  return {
    users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
    enabledUsers: db.prepare('SELECT COUNT(*) as count FROM users WHERE enabled = 1').get().count,
    disabledUsers: db.prepare('SELECT COUNT(*) as count FROM users WHERE enabled = 0').get().count,
    groups: db.prepare('SELECT COUNT(*) as count FROM groups').get().count,
    memberships: db.prepare('SELECT COUNT(*) as count FROM memberships').get().count,
    ous: db.prepare('SELECT COUNT(*) as count FROM ous').get().count,
    serviceAccounts: db.prepare('SELECT COUNT(*) as count FROM service_accounts').get().count,
    findings: db.prepare('SELECT COUNT(*) as count FROM findings').get().count,
    criticalFindings: db.prepare("SELECT COUNT(*) as count FROM findings WHERE severity = 'CRITICAL'").get().count,
    highFindings: db.prepare("SELECT COUNT(*) as count FROM findings WHERE severity = 'HIGH'").get().count,
    mediumFindings: db.prepare("SELECT COUNT(*) as count FROM findings WHERE severity = 'MEDIUM'").get().count,
    lowFindings: db.prepare("SELECT COUNT(*) as count FROM findings WHERE severity = 'LOW'").get().count,
    proposedRoles: db.prepare('SELECT COUNT(*) as count FROM proposed_roles').get().count,
    departments: db.prepare("SELECT COUNT(DISTINCT department) as count FROM users WHERE department IS NOT NULL AND department != ''").get().count,
    titles: db.prepare("SELECT COUNT(DISTINCT title) as count FROM users WHERE title IS NOT NULL AND title != ''").get().count,
  };
}

function getMaxNestingDepth(db) {
  const row = db.prepare('SELECT MAX(depth) as max_depth FROM effective_memberships').get();
  return row ? row.max_depth || 0 : 0;
}

function getUsersWithMostGroups(db, limit = 20) {
  return db.prepare(`
    SELECT user_name, COUNT(*) as group_count
    FROM effective_memberships
    GROUP BY user_name
    ORDER BY group_count DESC
    LIMIT ?
  `).all(limit);
}

function getGroupsByNestingDepth(db) {
  return db.prepare(`
    SELECT group_name, MAX(depth) as max_depth, COUNT(DISTINCT user_name) as user_count
    FROM effective_memberships
    WHERE depth > 0
    GROUP BY group_name
    ORDER BY max_depth DESC
  `).all();
}

function getDepartmentSummary(db) {
  return db.prepare(`
    SELECT department, COUNT(*) as user_count,
           COUNT(DISTINCT title) as title_count
    FROM users
    WHERE department IS NOT NULL AND department != ''
    GROUP BY department
    ORDER BY user_count DESC
  `).all();
}

function getFindingsByCategory(db) {
  return db.prepare(`
    SELECT category, severity, COUNT(*) as count
    FROM findings
    GROUP BY category, severity
    ORDER BY
      CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 END,
      category
  `).all();
}

module.exports = {
  initEngine,
  initDatabase,
  getDatabase,
  closeDatabase,
  resetDatabase,
  clearAnalysisData,
  clearImportData,
  getStats,
  getMaxNestingDepth,
  getUsersWithMostGroups,
  getGroupsByNestingDepth,
  getDepartmentSummary,
  getFindingsByCategory,
  DB_PATH,
  DATA_DIR,
};
