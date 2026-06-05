// Generate synthetic AD data for demonstration purposes
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'imports');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// --- Hospital departments and functions ---
const DEPARTMENTS = [
  { name: 'Intensive Care', abbr: 'IC', size: 120 },
  { name: 'Spoedeisende Hulp', abbr: 'SEH', size: 95 },
  { name: 'Cardiologie', abbr: 'CAR', size: 85 },
  { name: 'Chirurgie', abbr: 'CHI', size: 110 },
  { name: 'Interne Geneeskunde', abbr: 'INT', size: 90 },
  { name: 'Radiologie', abbr: 'RAD', size: 60 },
  { name: 'Neurologie', abbr: 'NEU', size: 55 },
  { name: 'Pediatrie', abbr: 'PED', size: 70 },
  { name: 'Gynaecologie', abbr: 'GYN', size: 65 },
  { name: 'Oncologie', abbr: 'ONC', size: 75 },
  { name: 'Apotheek', abbr: 'APO', size: 35 },
  { name: 'Laboratorium', abbr: 'LAB', size: 45 },
  { name: 'Facilitair', abbr: 'FAC', size: 40 },
  { name: 'ICT', abbr: 'ICT', size: 30 },
  { name: 'Financien', abbr: 'FIN', size: 25 },
  { name: 'HRM', abbr: 'HRM', size: 20 },
  { name: 'Directie', abbr: 'DIR', size: 15 },
  { name: 'Kwaliteit en Veiligheid', abbr: 'KV', size: 15 },
];

const FUNCTIONS = {
  clinical: ['Verpleegkundige', 'Arts', 'Arts-assistent', 'Medisch specialist', 'Physician Assistant', 'Verpleegkundig specialist'],
  support: ['Secretaresse', 'Baliemedewerker', 'Teamleider', 'Afdelingshoofd', 'Medewerker planning'],
  ict: ['Systeembeheerder', 'Applicatiebeheerder', 'Servicedesk medewerker', 'ICT Manager', 'Informatiebeveiliger'],
  facility: ['Facilitair medewerker', 'Schoonmaak', 'Technisch medewerker', 'Receptionist'],
  finance: ['Financial controller', 'Administratief medewerker', 'Inkoper', 'Manager bedrijfsvoering'],
  hrm: ['HR adviseur', 'Salarisadministrateur', 'Recruiter', 'HR Manager'],
  management: ['Directeur', 'Manager', 'Bestuurder', 'Bestuursadviseur'],
  quality: ['Kwaliteitsmedewerker', 'Veiligheidskundige', 'Functionaris gegevensbescherming'],
  lab: ['Laborant', 'Analist', 'Laboratorium manager'],
  pharmacy: ['Apotheker', 'Apotheekassistent', 'Farmaceutisch medewerker'],
  radiology: ['Radiodiagnostisch laborant', 'Radioloog', 'Echoscopist'],
};

function getFunctionsForDept(dept) {
  switch (dept.abbr) {
    case 'ICT': return FUNCTIONS.ict;
    case 'FAC': return FUNCTIONS.facility;
    case 'FIN': return FUNCTIONS.finance;
    case 'HRM': return FUNCTIONS.hrm;
    case 'DIR': return FUNCTIONS.management;
    case 'KV': return FUNCTIONS.quality;
    case 'LAB': return FUNCTIONS.lab;
    case 'APO': return FUNCTIONS.pharmacy;
    case 'RAD': return [...FUNCTIONS.radiology, ...FUNCTIONS.support];
    default: return [...FUNCTIONS.clinical, ...FUNCTIONS.support];
  }
}

// --- Name generators ---
const FIRST_NAMES = ['Jan','Piet','Klaas','Henk','Maria','Anna','Sophie','Lisa','Emma','Eva','Thomas','Lars','Sander','Bart','Niels','Marieke','Fleur','Iris','Julia','Laura','Rick','Tim','Mark','Paul','Peter','Frank','Hans','Erik','Rob','Jeroen','Wouter','Daan','Bram','Joost','Cas','Lotte','Anouk','Femke','Sanne','Linda','Monique','Ingrid','Esther','Marion','Diana','Petra','Nicole','Bianca','Wendy','Heleen'];
const LAST_NAMES = ['de Vries','Jansen','van den Berg','Bakker','Visser','Smit','Meijer','de Boer','Mulder','de Groot','Bos','Vos','Peters','Hendriks','van Dijk','Dekker','Brouwer','de Wit','Dijkstra','Smeets','de Graaf','van der Linden','van Leeuwen','Willems','Hoekstra','Koster','Vermeer','van Dam','van der Wal','Molenaar','de Haan','Kuijpers','Scholten','van Wijk','Postma','Martens','Jacobs','van der Meer','Huisman','Schouten'];

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomDate(yearMin, yearMax) {
  const y = yearMin + Math.floor(Math.random() * (yearMax - yearMin));
  const m = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const d = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  return `${y}-${m}-${d} 08:00:00`;
}

// --- Generate users ---
const users = [];
let userIdx = 0;

for (const dept of DEPARTMENTS) {
  const funcs = getFunctionsForDept(dept);
  const headSam = `${dept.abbr.toLowerCase()}.hoofd`;

  for (let i = 0; i < dept.size; i++) {
    const first = randomItem(FIRST_NAMES);
    const last = randomItem(LAST_NAMES);
    const sam = `${first.toLowerCase()}.${last.toLowerCase().replace(/\s+/g, '').replace(/'/g, '')}${userIdx}`;
    const title = randomItem(funcs);
    const isHead = i === 0;
    const enabled = Math.random() > 0.06; // 6% disabled
    const daysSinceLogin = Math.floor(Math.random() * 400);
    const lastLogon = daysSinceLogin < 365 ? randomDate(2025, 2026) : '';
    const pwdLastSet = randomDate(2023, 2026);
    const pwdNeverExpires = Math.random() < 0.08;
    const created = randomDate(2015, 2025);

    users.push({
      SamAccountName: sam,
      DisplayName: `${first} ${last}`,
      EmailAddress: `${sam}@ziekenhuis.local`,
      Department: dept.name,
      Title: isHead ? 'Afdelingshoofd' : title,
      ManagerSam: isHead ? 'dir.bestuurder0' : headSam,
      Enabled: enabled ? 'True' : 'False',
      LastLogonDate: lastLogon,
      PasswordLastSet: pwdLastSet,
      PasswordNeverExpires: pwdNeverExpires ? 'True' : 'False',
      DistinguishedName: `CN=${first} ${last},OU=${dept.name},OU=Medewerkers,DC=ziekenhuis,DC=local`,
      EmployeeID: `EMP${String(1000 + userIdx).padStart(5, '0')}`,
      EmployeeType: 'Medewerker',
      WhenCreated: created,
      UserPrincipalName: `${sam}@ziekenhuis.local`,
      LockedOut: 'False',
      AccountExpirationDate: '',
      Description: '',
      _dept: dept,
      _title: isHead ? 'Afdelingshoofd' : title,
    });
    userIdx++;
  }
}

// --- Generate groups (realistic hospital AD mess) ---
const groups = [];
const memberships = [];

// Application groups
const APP_GROUPS = [
  'APP-EPD-Lezen', 'APP-EPD-Schrijven', 'APP-EPD-Admin',
  'APP-PACS-Beelden', 'APP-PACS-Admin',
  'APP-SAP-Basis', 'APP-SAP-Financieel', 'APP-SAP-Inkoop',
  'APP-Office365-E3', 'APP-Office365-E5',
  'APP-Citrix-Klinisch', 'APP-Citrix-Kantoor',
  'APP-Laboratorium', 'APP-Apotheek',
  'APP-Planning-Rooster', 'APP-Telefonie',
  'APP-Intranet-Redactie', 'APP-SharePoint-Alle',
  'APP-VPN-Extern', 'APP-Wifi-Medewerker',
];

// Legacy groups (no naming convention — the mess)
const LEGACY_GROUPS = [
  'Verpleging', 'Artsen', 'Alle_medewerkers', 'Medisch',
  'Kantoor', 'Klinisch personeel', 'Management',
  'GG_IC_Team', 'GG_SEH_Team', 'GG_Chirurgie',
  'Lezen_patientdossiers', 'Schrijven_patientdossiers',
  'Printen_A4', 'Printen_A3_Kleur', 'Scan_Afdeling',
  'VPN_Oud', 'Citrix_Legacy', 'Exchange_Users',
  'Beveiliging_Badge_Toegang', 'Parkeren_Personeel',
  'Kantine_Korting', 'Sportfaciliteit',
  'Project_EPD_Migratie', 'Project_Nieuwbouw', 'Project_Covid',
  'Temp_Toegang_Archief', 'Temp_Toegang_Serverruimte',
  'Oud_Radiologie_Systeem', 'Oud_HR_Systeem',
  'Test_Groep_Jan', 'Test_Groep_Piet', 'Test_DTAP',
];

// Department groups
const DEPT_GROUPS = DEPARTMENTS.map(d => `Afdeling_${d.abbr}`);

// Nested groups (the nesting problem)
const NESTED_GROUPS = [
  'Niv1_Alle_Klinisch',
  'Niv2_Verpleging_Alle', 'Niv2_Artsen_Alle', 'Niv2_Ondersteuning',
  'Niv3_VP_IC', 'Niv3_VP_SEH', 'Niv3_VP_Chirurgie', 'Niv3_VP_Interne',
  'Niv4_VP_IC_Dag', 'Niv4_VP_IC_Nacht', 'Niv4_VP_SEH_Trauma',
  'Niv5_VP_IC_Dag_Senior', 'Niv5_VP_IC_Dag_Junior',
  'Niv6_VP_IC_Dag_Senior_EPD', 'Niv6_VP_IC_Dag_Senior_PACS',
  'Niv7_VP_IC_Dag_Senior_EPD_Admin',
];

// Admin groups
const ADMIN_GROUPS = [
  'Domain Admins', 'Enterprise Admins', 'Schema Admins',
  'Administrators', 'Server Operators', 'Backup Operators',
  'DnsAdmins', 'Account Operators',
  'ICT_Beheerders', 'EPD_Beheerders',
];

// Design-convention groups (target architecture: fga/affu/afdl containers + appl/drvm/ntfs/ctxr resources)
const DESIGN_GROUPS = [
  'FGA - Verpleegkundigen', 'FGA - Medisch Specialist', 'FGA - Externe medewerker',
  'AFFU-IC-Verpleging', 'AFDL-Chirurgie',
  'APPL-EPD-Lezen', 'APPL-EPD-Schrijven', 'APPL-PACS-Beelden',
  'DRVM-Afdelingsschijf-CHI', 'NTFS-Data-Chirurgie-RW', 'CTXR-Klinisch-Desktop',
];

const ALL_GROUPS = [...APP_GROUPS, ...LEGACY_GROUPS, ...DEPT_GROUPS, ...NESTED_GROUPS, ...ADMIN_GROUPS, ...DESIGN_GROUPS];

for (const gName of ALL_GROUPS) {
  const isAdmin = ADMIN_GROUPS.includes(gName);
  groups.push({
    Name: gName,
    SamAccountName: gName,
    GroupCategory: 'Security',
    GroupScope: isAdmin ? 'Global' : randomItem(['Global', 'DomainLocal', 'Universal']),
    Description: '',
    DistinguishedName: `CN=${gName},OU=Groepen,DC=ziekenhuis,DC=local`,
    ManagedBy: '',
    MemberCount: 0,
    WhenCreated: randomDate(2012, 2024),
    WhenChanged: randomDate(2022, 2026),
  });
}

// Add empty groups
for (let i = 0; i < 25; i++) {
  const name = `Leeg_Groep_${i}`;
  groups.push({
    Name: name, SamAccountName: name, GroupCategory: randomItem(['Security', 'Distribution']),
    GroupScope: 'Global', Description: '', DistinguishedName: `CN=${name},OU=Groepen,DC=ziekenhuis,DC=local`,
    ManagedBy: '', MemberCount: 0, WhenCreated: randomDate(2015, 2020), WhenChanged: randomDate(2018, 2021),
  });
}

// --- Generate memberships ---

// Nested group structure (7 levels deep!)
const nestingChain = [
  ['Niv1_Alle_Klinisch', 'Niv2_Verpleging_Alle'],
  ['Niv1_Alle_Klinisch', 'Niv2_Artsen_Alle'],
  ['Niv1_Alle_Klinisch', 'Niv2_Ondersteuning'],
  ['Niv2_Verpleging_Alle', 'Niv3_VP_IC'],
  ['Niv2_Verpleging_Alle', 'Niv3_VP_SEH'],
  ['Niv2_Verpleging_Alle', 'Niv3_VP_Chirurgie'],
  ['Niv2_Verpleging_Alle', 'Niv3_VP_Interne'],
  ['Niv3_VP_IC', 'Niv4_VP_IC_Dag'],
  ['Niv3_VP_IC', 'Niv4_VP_IC_Nacht'],
  ['Niv3_VP_SEH', 'Niv4_VP_SEH_Trauma'],
  ['Niv4_VP_IC_Dag', 'Niv5_VP_IC_Dag_Senior'],
  ['Niv4_VP_IC_Dag', 'Niv5_VP_IC_Dag_Junior'],
  ['Niv5_VP_IC_Dag_Senior', 'Niv6_VP_IC_Dag_Senior_EPD'],
  ['Niv5_VP_IC_Dag_Senior', 'Niv6_VP_IC_Dag_Senior_PACS'],
  ['Niv6_VP_IC_Dag_Senior_EPD', 'Niv7_VP_IC_Dag_Senior_EPD_Admin'],
  // Cross-nesting
  ['Niv1_Alle_Klinisch', 'APP-EPD-Lezen'],
  ['Niv2_Artsen_Alle', 'APP-EPD-Schrijven'],
  ['Niv7_VP_IC_Dag_Senior_EPD_Admin', 'APP-EPD-Admin'],
  // Design-convention nesting: valid links plus deliberate violations
  // so the conformity analysis has something to detect
  ['APPL-EPD-Lezen', 'AFFU-IC-Verpleging'],            // valid: container in resource
  ['DRVM-Afdelingsschijf-CHI', 'AFDL-Chirurgie'],      // valid: container in resource
  ['CTXR-Klinisch-Desktop', 'FGA - Verpleegkundigen'], // valid: fga in ctxr
  ['APPL-EPD-Schrijven', 'APPL-EPD-Lezen'],            // violation: appl-in-appl (soortgenoot)
  ['FGA - Verpleegkundigen', 'APPL-PACS-Beelden'],     // violation: resource in container (omgekeerd)
  ['FGA - Verpleegkundigen', 'AFFU-IC-Verpleging'],    // violation: affu-in-fga
  ['FGA - Verpleegkundigen', 'AFDL-Chirurgie'],        // violation: afdl-in-fga
];

for (const [parent, child] of nestingChain) {
  memberships.push({
    GroupName: parent, MemberName: child, MemberType: 'group',
    MemberDN: `CN=${child},OU=Groepen,DC=ziekenhuis,DC=local`,
    GroupDN: `CN=${parent},OU=Groepen,DC=ziekenhuis,DC=local`,
  });
}

// User memberships
for (const u of users) {
  const dept = u._dept;
  const title = u._title;

  // Department group
  memberships.push({ GroupName: `Afdeling_${dept.abbr}`, MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });

  // Alle medewerkers
  memberships.push({ GroupName: 'Alle_medewerkers', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });

  // Function-based
  if (['Verpleegkundige', 'Verpleegkundig specialist'].includes(title)) {
    memberships.push({ GroupName: 'Verpleging', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'APP-EPD-Lezen', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'APP-EPD-Schrijven', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'Klinisch personeel', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'FGA - Verpleegkundigen', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });

    // Nested groups for IC nurses
    if (dept.abbr === 'IC') {
      memberships.push({ GroupName: 'Niv3_VP_IC', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
      if (Math.random() > 0.5) {
        memberships.push({ GroupName: 'Niv4_VP_IC_Dag', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
        if (Math.random() > 0.6) {
          memberships.push({ GroupName: 'Niv5_VP_IC_Dag_Senior', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
        }
      }
    }
    if (dept.abbr === 'SEH') {
      memberships.push({ GroupName: 'Niv3_VP_SEH', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    }
  }

  if (['Arts', 'Arts-assistent', 'Medisch specialist'].includes(title)) {
    memberships.push({ GroupName: 'Artsen', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'APP-EPD-Lezen', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'APP-EPD-Schrijven', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'APP-PACS-Beelden', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'Medisch', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'Niv2_Artsen_Alle', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'FGA - Medisch Specialist', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
  }

  // Office 365
  memberships.push({ GroupName: Math.random() > 0.3 ? 'APP-Office365-E3' : 'APP-Office365-E5', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });

  // Random legacy groups (the mess)
  const legacyCount = Math.floor(Math.random() * 8);
  const shuffled = [...LEGACY_GROUPS].sort(() => Math.random() - 0.5);
  for (let i = 0; i < legacyCount; i++) {
    memberships.push({ GroupName: shuffled[i], MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
  }

  // ICT staff in admin groups
  if (dept.abbr === 'ICT' && ['Systeembeheerder', 'ICT Manager'].includes(title)) {
    memberships.push({ GroupName: 'ICT_Beheerders', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    memberships.push({ GroupName: 'Domain Admins', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    if (Math.random() > 0.5) {
      memberships.push({ GroupName: 'Enterprise Admins', MemberName: u.SamAccountName, MemberType: 'user', MemberDN: u.DistinguishedName, GroupDN: '' });
    }
  }
}

// The "484 groups admin" - one ICT person in nearly everything
const overloadedAdmin = users.find(u => u._dept.abbr === 'ICT' && u._title === 'Systeembeheerder');
if (overloadedAdmin) {
  for (const g of ALL_GROUPS) {
    if (!memberships.find(m => m.GroupName === g && m.MemberName === overloadedAdmin.SamAccountName)) {
      memberships.push({ GroupName: g, MemberName: overloadedAdmin.SamAccountName, MemberType: 'user', MemberDN: overloadedAdmin.DistinguishedName, GroupDN: '' });
    }
  }
}

// --- Technical accounts in the users export (empty Title -> persona 'Technisch account') ---
const TECHNICAL_USERS = [
  { sam: 'sa_backup_agent', ou: 'Service Accounts', desc: 'Backup agent service account' },
  { sam: 'adm_jdevries', ou: 'Admin Users', desc: 'Beheeraccount J. de Vries' },
  { sam: 'fm_receptie', ou: 'Functional Mailboxes', desc: 'Functionele mailbox receptie' },
  { sam: 'al_balie01', ou: 'Autologon', desc: 'Autologon balie-PC 01' },
  { sam: 'healthmailbox0a1b2c', ou: 'Exchange', desc: 'Exchange health mailbox' },
  { sam: 'lv_siemens', ou: 'Leveranciers', desc: 'Leveranciersaccount Siemens' },
];
for (const t of TECHNICAL_USERS) {
  users.push({
    SamAccountName: t.sam,
    DisplayName: t.sam,
    EmailAddress: '',
    Department: '',
    Title: '',
    ManagerSam: '',
    Enabled: 'True',
    LastLogonDate: randomDate(2025, 2026),
    PasswordLastSet: randomDate(2023, 2026),
    PasswordNeverExpires: 'True',
    DistinguishedName: `CN=${t.sam},OU=${t.ou},DC=ziekenhuis,DC=local`,
    EmployeeID: '',
    EmployeeType: 'Technisch',
    WhenCreated: randomDate(2015, 2024),
    UserPrincipalName: `${t.sam}@ziekenhuis.local`,
    LockedOut: 'False',
    AccountExpirationDate: '',
    Description: t.desc,
  });
}

// --- Generate OUs ---
const ous = [
  { Name: 'Ziekenhuis', DistinguishedName: 'DC=ziekenhuis,DC=local', Description: 'Root', Depth: 0, WhenCreated: '2010-01-01 00:00:00' },
  { Name: 'Medewerkers', DistinguishedName: 'OU=Medewerkers,DC=ziekenhuis,DC=local', Description: 'Alle medewerkers', Depth: 1, WhenCreated: '2010-01-01 00:00:00' },
  { Name: 'Groepen', DistinguishedName: 'OU=Groepen,DC=ziekenhuis,DC=local', Description: 'Alle groepen', Depth: 1, WhenCreated: '2010-01-01 00:00:00' },
  { Name: 'Service Accounts', DistinguishedName: 'OU=Service Accounts,DC=ziekenhuis,DC=local', Description: 'Service accounts', Depth: 1, WhenCreated: '2012-03-15 00:00:00' },
];
for (const dept of DEPARTMENTS) {
  ous.push({ Name: dept.name, DistinguishedName: `OU=${dept.name},OU=Medewerkers,DC=ziekenhuis,DC=local`, Description: `Afdeling ${dept.name}`, Depth: 2, WhenCreated: randomDate(2010, 2015) });
}

// --- Generate service accounts ---
const serviceAccounts = [
  { SamAccountName: 'svc_epd', ServicePrincipalNames: 'HTTP/epd.ziekenhuis.local', PasswordLastSet: '2021-03-15 10:00:00', LastLogonDate: '2026-03-14 06:00:00', Enabled: 'True', Description: 'EPD service account', WhenCreated: '2015-06-01 00:00:00' },
  { SamAccountName: 'svc_pacs', ServicePrincipalNames: 'HTTP/pacs.ziekenhuis.local', PasswordLastSet: '2020-11-01 10:00:00', LastLogonDate: '2026-03-14 06:00:00', Enabled: 'True', Description: 'PACS imaging service', WhenCreated: '2016-01-15 00:00:00' },
  { SamAccountName: 'svc_backup', ServicePrincipalNames: 'HOST/backup.ziekenhuis.local', PasswordLastSet: '2019-06-01 10:00:00', LastLogonDate: '2026-03-10 06:00:00', Enabled: 'True', Description: 'Veeam backup service', WhenCreated: '2014-09-01 00:00:00' },
  { SamAccountName: 'svc_sap', ServicePrincipalNames: 'HTTP/sap.ziekenhuis.local', PasswordLastSet: '2022-01-10 10:00:00', LastLogonDate: '2026-03-14 06:00:00', Enabled: 'True', Description: 'SAP service account', WhenCreated: '2017-03-01 00:00:00' },
  { SamAccountName: 'svc_print_old', ServicePrincipalNames: '', PasswordLastSet: '2018-02-14 10:00:00', LastLogonDate: '', Enabled: 'True', Description: 'Oud printsysteem (niet meer in gebruik?)', WhenCreated: '2013-05-01 00:00:00' },
  { SamAccountName: 'svc_monitor', ServicePrincipalNames: 'HOST/monitor.ziekenhuis.local', PasswordLastSet: '2023-07-01 10:00:00', LastLogonDate: '2026-03-14 05:00:00', Enabled: 'True', Description: 'Monitoring agent', WhenCreated: '2019-01-15 00:00:00' },
  { SamAccountName: 'svc_citrix', ServicePrincipalNames: 'HTTP/citrix.ziekenhuis.local', PasswordLastSet: '2021-09-20 10:00:00', LastLogonDate: '2026-03-14 06:00:00', Enabled: 'True', Description: 'Citrix XenApp service', WhenCreated: '2015-11-01 00:00:00' },
  { SamAccountName: 'svc_sql_epd', ServicePrincipalNames: 'MSSQLSvc/sqlepd.ziekenhuis.local:1433', PasswordLastSet: '2020-04-01 10:00:00', LastLogonDate: '2026-03-14 06:00:00', Enabled: 'True', Description: 'SQL Server EPD database', WhenCreated: '2016-06-01 00:00:00' },
];

// --- Write CSVs ---
function toCsv(records, columns) {
  const header = columns.join(',');
  const rows = records.map(r => columns.map(c => {
    const val = String(r[c] || '').replace(/"/g, '""');
    return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
  }).join(','));
  return header + '\n' + rows.join('\n') + '\n';
}

const userCols = ['SamAccountName','DisplayName','EmailAddress','Department','Title','ManagerSam','Enabled','LastLogonDate','PasswordLastSet','PasswordNeverExpires','DistinguishedName','EmployeeID','EmployeeType','WhenCreated','UserPrincipalName','LockedOut','AccountExpirationDate','Description'];
fs.writeFileSync(path.join(OUTPUT_DIR, 'users.csv'), toCsv(users, userCols));

const groupCols = ['Name','SamAccountName','GroupCategory','GroupScope','Description','DistinguishedName','ManagedBy','MemberCount','WhenCreated','WhenChanged'];
fs.writeFileSync(path.join(OUTPUT_DIR, 'groups.csv'), toCsv(groups, groupCols));

const memCols = ['GroupName','MemberName','MemberType','MemberDN','GroupDN'];
// Deduplicate memberships
const uniqueMembers = new Map();
for (const m of memberships) {
  const key = `${m.GroupName}|${m.MemberName}`;
  if (!uniqueMembers.has(key)) uniqueMembers.set(key, m);
}
fs.writeFileSync(path.join(OUTPUT_DIR, 'memberships.csv'), toCsv([...uniqueMembers.values()], memCols));

const ouCols = ['Name','DistinguishedName','Description','Depth','WhenCreated'];
fs.writeFileSync(path.join(OUTPUT_DIR, 'ous.csv'), toCsv(ous, ouCols));

const saCols = ['SamAccountName','ServicePrincipalNames','PasswordLastSet','LastLogonDate','Enabled','Description','WhenCreated'];
fs.writeFileSync(path.join(OUTPUT_DIR, 'service-accounts.csv'), toCsv(serviceAccounts, saCols));

console.log(`Generated synthetic data for ${users.length} users, ${groups.length} groups, ${uniqueMembers.size} memberships`);
console.log(`Output: ${OUTPUT_DIR}`);
