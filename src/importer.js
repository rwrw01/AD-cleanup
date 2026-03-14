const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { getDatabase, clearImportData, DATA_DIR } = require('./database');

const IMPORT_DIR = path.join(DATA_DIR, 'imports');

function readCsv(filename) {
  const filePath = path.join(IMPORT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  Bestand niet gevonden: ${filename} (overgeslagen)`);
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });
  console.log(`  ${filename}: ${records.length} rijen gelezen`);
  return records;
}

function toBool(val) {
  if (val === undefined || val === null || val === '') return 0;
  const s = String(val).toLowerCase().trim();
  return (s === 'true' || s === '1' || s === 'yes' || s === 'ja') ? 1 : 0;
}

function extractOU(dn) {
  if (!dn) return '';
  const parts = dn.split(',').filter(p => p.startsWith('OU='));
  return parts.map(p => p.replace('OU=', '')).reverse().join('/');
}

function importUsers(db, records) {
  if (!records) return 0;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO users
    (sam_account_name, display_name, email, department, title, manager_sam,
     enabled, last_logon, password_last_set, password_never_expires,
     distinguished_name, employee_id, employee_type, when_created, ou_path,
     upn, locked_out, account_expiration, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const sam = r.SamAccountName || r.samAccountName || r.sam_account_name;
      if (!sam) continue;
      stmt.run(
        sam,
        r.DisplayName || r.display_name || '',
        r.EmailAddress || r.email || '',
        r.Department || r.department || '',
        r.Title || r.title || '',
        r.ManagerSam || r.manager_sam || r.Manager || '',
        toBool(r.Enabled || r.enabled),
        r.LastLogonDate || r.last_logon || '',
        r.PasswordLastSet || r.password_last_set || '',
        toBool(r.PasswordNeverExpires || r.password_never_expires),
        r.DistinguishedName || r.distinguished_name || '',
        r.EmployeeID || r.employee_id || '',
        r.EmployeeType || r.employee_type || '',
        r.WhenCreated || r.when_created || '',
        extractOU(r.DistinguishedName || r.distinguished_name || ''),
        r.UserPrincipalName || r.upn || '',
        toBool(r.LockedOut || r.locked_out),
        r.AccountExpirationDate || r.account_expiration || '',
        r.Description || r.description || ''
      );
    }
  });

  tx(records);
  return records.length;
}

function importGroups(db, records) {
  if (!records) return 0;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO groups
    (name, sam_account_name, category, scope, description,
     distinguished_name, managed_by, member_count, when_created, when_changed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const name = r.Name || r.name || r.SamAccountName || r.sam_account_name;
      if (!name) continue;
      stmt.run(
        name,
        r.SamAccountName || r.sam_account_name || name,
        r.GroupCategory || r.category || '',
        r.GroupScope || r.scope || '',
        r.Description || r.description || '',
        r.DistinguishedName || r.distinguished_name || '',
        r.ManagedBy || r.managed_by || '',
        parseInt(r.MemberCount || r.member_count || '0', 10) || 0,
        r.WhenCreated || r.when_created || '',
        r.WhenChanged || r.when_changed || ''
      );
    }
  });

  tx(records);
  return records.length;
}

function importMemberships(db, records) {
  if (!records) return 0;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO memberships
    (group_name, member_name, member_type, member_dn, group_dn)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const groupName = r.GroupName || r.group_name;
      const memberName = r.MemberName || r.member_name;
      if (!groupName || !memberName) continue;
      stmt.run(
        groupName,
        memberName,
        r.MemberType || r.member_type || '',
        r.MemberDN || r.member_dn || '',
        r.GroupDN || r.group_dn || ''
      );
    }
  });

  tx(records);
  return records.length;
}

function importOUs(db, records) {
  if (!records) return 0;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ous
    (name, distinguished_name, description, depth, when_created)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const dn = r.DistinguishedName || r.distinguished_name;
      if (!dn) continue;
      stmt.run(
        r.Name || r.name || '',
        dn,
        r.Description || r.description || '',
        parseInt(r.Depth || r.depth || '0', 10) || 0,
        r.WhenCreated || r.when_created || ''
      );
    }
  });

  tx(records);
  return records.length;
}

function importServiceAccounts(db, records) {
  if (!records) return 0;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO service_accounts
    (sam_account_name, spns, password_last_set, last_logon, enabled, description, when_created)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const sam = r.SamAccountName || r.sam_account_name;
      if (!sam) continue;
      stmt.run(
        sam,
        r.ServicePrincipalNames || r.spns || '',
        r.PasswordLastSet || r.password_last_set || '',
        r.LastLogonDate || r.last_logon || '',
        toBool(r.Enabled || r.enabled),
        r.Description || r.description || '',
        r.WhenCreated || r.when_created || ''
      );
    }
  });

  tx(records);
  return records.length;
}

function runImport() {
  console.log('=== AD Opschonen — CSV Import ===\n');

  if (!fs.existsSync(IMPORT_DIR)) {
    console.error(`Import directory niet gevonden: ${IMPORT_DIR}`);
    console.error('Kopieer CSV-bestanden naar data/imports/ en probeer opnieuw.');
    process.exit(1);
  }

  const csvFiles = fs.readdirSync(IMPORT_DIR).filter(f => f.endsWith('.csv'));
  if (csvFiles.length === 0) {
    console.error('Geen CSV-bestanden gevonden in data/imports/');
    console.error('Draai eerst de PowerShell export scripts.');
    process.exit(1);
  }

  console.log(`Gevonden CSV-bestanden: ${csvFiles.join(', ')}\n`);

  const db = getDatabase();
  clearImportData(db);

  console.log('Importeren...');
  const userCount = importUsers(db, readCsv('users.csv'));
  const groupCount = importGroups(db, readCsv('groups.csv'));
  const membershipCount = importMemberships(db, readCsv('memberships.csv'));
  const ouCount = importOUs(db, readCsv('ous.csv'));
  const saCount = importServiceAccounts(db, readCsv('service-accounts.csv'));

  db.prepare(`
    INSERT INTO import_sessions (file_count, user_count, group_count, membership_count, ou_count, service_account_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(csvFiles.length, userCount, groupCount, membershipCount, ouCount, saCount);

  console.log('\n=== Import compleet ===');
  console.log(`  Users:            ${userCount}`);
  console.log(`  Groups:           ${groupCount}`);
  console.log(`  Memberships:      ${membershipCount}`);
  console.log(`  OUs:              ${ouCount}`);
  console.log(`  Service accounts: ${saCount}`);
  console.log('\nDraai nu: npm run analyze');

  db.close();
}

if (require.main === module) {
  runImport();
}

module.exports = { runImport, readCsv, importUsers, importGroups, importMemberships, importOUs, importServiceAccounts };
