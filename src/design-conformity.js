const { getDatabase } = require('./database');

// Oorspronkelijk ontwerp prefixen
const CONTAINER_TYPES = ['fga', 'afdl', 'affu', 'plus', 'ctxr'];
const RESOURCE_TYPES = ['appl', 'drvm', 'ntfs', 'mail'];

function classifyGroup(name) {
  const n = name.toLowerCase();
  if (n.startsWith('fga ') || n.startsWith('fga-')) return 'fga';
  if (n.startsWith('afdl-')) return 'afdl';
  if (n.startsWith('affu-')) return 'affu';
  if (n.startsWith('appl-')) return 'appl';
  if (n.startsWith('drvm-')) return 'drvm';
  if (n.startsWith('ctxr-')) return 'ctxr';
  if (n.startsWith('ntfs-')) return 'ntfs';
  if (n.startsWith('mail-') || n.startsWith('mail ')) return 'mail';
  if (n.startsWith('plus-') || n.startsWith('plus_')) return 'plus';
  if (n.startsWith('group_')) return 'entra_sync';
  if (n.startsWith('adm-')) return 'adm';
  if (n.startsWith('sec_') || n.startsWith('sec-')) return 'sec';
  if (n.startsWith('mg ') || n.startsWith('mg-')) return 'mg';
  if (n.startsWith('func-')) return 'func';
  if (n.startsWith('o365-') || n.startsWith('mig-')) return 'cloud';
  return 'overig';
}

const EXTERNAL_FGA = [
  'FGA - Externe medewerker', 'FGA - Externe verloskundige mdw',
  'FGA - DermaTeam', 'FGA - GGZ WNB', 'FGA - Groenhuijzen',
  'FGA - Microvida', 'FGA - PMC', 'FGA - Pathologie ZWN',
  'FGA - ZRTI', 'FGA - Asito', 'FGA - Bariatrisch Centrum',
  'FGA - Accureon', 'FGA - Presentatie Accounts',
];

function classifyPersona(title, department, fgas) {
  const t = (title || '').toLowerCase();
  const d = (department || '').toLowerCase();

  // FGA first
  if (fgas.some(f => EXTERNAL_FGA.includes(f))) return 'Externe medewerker';
  if (fgas.some(f => f === 'FGA - Medisch Specialist')) return 'Medisch specialist/Arts';

  // Title patterns
  if (['arts','specialist','chirurg','anesthesioloog','geriater','neuroloog',
    'gynaecoloog','cardioloog','internist','radioloog','uroloog','dermatoloog',
    'patholoog','longarts','reumatoloog','intensivist','oogarts','kinderarts',
    'nefroloog','oncoloog','revalidatiearts','seh arts','basisarts','huisarts',
    'coassistent','aios','anios','fysicus','ziekenhuisapotheker',
    'verpleegkundig specialist','physician assistant'].some(p => t.includes(p)))
    return 'Medisch specialist/Arts';

  if (['verpleegkundige','vpk','verpleegk.','verplk.','verpleeg',
    'endoscopie','recovery verpleeg','dialyseverpleeg','ic-verpleeg',
    'oncologie verpleeg','wondverpleeg','praktijkverpleeg',
    'pijnconsulent','sedationist',
    'instructievepleegkundige','leerling verpleegk',
    'consult. psych. verpleegk','sociaal psych. verpleegk',
    'geriatrisch verpleegk','multiple sclerose verpleegk',
    'hartrevalidatie verpleegk','obstetrie verpleegk',
    'verpleeghulp','trainee medisch hulpverlener'].some(p => t.includes(p)))
    return 'Verpleegkundige';

  if (['manager zorgeenheid','zorggroepmanager','teamleider','hoofd verpleeg',
    'leidinggevende','clustermanager','directeur','hoofd apotheek',
    'hoofd planning','hoofd functioneel','hoofd huisvesting',
    'hoofd zorgadm','hoofd automatisering','hoofd wetenschapsbureau',
    'hoofd zorgverkoop','hoofd eten','hoofd services',
    'hoofd medische technologie','hoofd services',
    'teammanager','bedrijfskundig manager','manager bedrijfsburo',
    'manager integraal','procesmanager','raad van bestuur',
    'secretaris raad van bestuur','decaan'].some(p => t.includes(p)))
    return 'Leidinggevende zorg';

  if (['secretaresse','managementassistent','medewerker zorgadministratie',
    'administratief medewerker','stafmedew.zorgadm','medewerker frontoffice',
    'transfermedew','planningsmedewerker','archiefmedewerker',
    'medewerker backoffice','medisch codeur',
    'mdw. pati\u00ebntenservicebureau','co\u00f6rdinator medisch archief',
    'stafmedewerker cli\u00ebntzaken'].some(p => t.includes(p)))
    return 'Medisch secretariaat';

  if (['doktersassistent','apothekersassistent','apotheekmedewerker',
    'assistent apothekersass','poliklinisch apotheker',
    'laborant','analist','technicus','radiodiag','echografist',
    'echoscopiste','oogheelkundig','gipsverbandmeester','optometrist',
    'orthoptist','verloskundige','logopedist','fysiotherapeut',
    'ergotherapeut','di\u00ebtist','dietist','psycholoog','maatschappelijk',
    'geestelijk','medisch technicus','operatieassistent','sterilisatie',
    'perfusionist','poliklinisch ok','assortimentsco\u00f6rd',
    'co\u00f6rd. steriele','deskundige steriele','deskundige infectie',
    'anesthesiemedewerker','ok assistent','lab.med.beeldvorming',
    'medewerker medisch','monitor','afdelingsassistent',
    'mdw. ster. med. hulpmiddelen','leerl. ster.med.hulpmiddelen',
    'case co\u00f6rd.zwangerenzorg','lactatiekundige',
    'medisch nucleair werker','biomedisch technoloog',
    'klinisch kraamverzorgende','praktijkopleider','praktijkcoach',
    'osas consulent','dbc consulent','pedagogisch medewerker',
    'podotherapeut','activiteitentherapeut','vaktherapeut',
    'lichttherapeut','urotherapeut','psycho diagnostisch',
    'audiologie assistent','anest. ass. oogheelkunde',
    'ggz-agoog','systeem therapeutisch','klinisch fysisch medewerker',
    'co\u00f6rdinator hartrevalidatie','co\u00f6rdinator palliatieve',
    'co\u00f6rdinator verpleegkundig onderzoek',
    'techn.coord.med.beeldvorming','medew.kwaliteitsinformatie',
    'chief nursing'].some(p => t.includes(p)))
    return 'Medische ondersteuning';

  if (['applicatiebeh','netwerkbeh','werkplekbeh','projectcoord',
    'projectmanager','projectleider','projectmedewerker',
    'projectco\u00f6rdinator','programmacoördinator','programmamanager',
    'adviseur','beleidsadviseur','beleidsadv.','beleidsmedewerker',
    'business control','concern control','informatiemanager','controller',
    'functionaris','kwaliteitsmedewerker','architect','mdw. digitale',
    'medewerker servicedesk','techn. applicatie','sr. technisch',
    'datamanager','salarisadministrateur','incidentmanager',
    'information security','medewerker hr services',
    'senior medewerker hr services','medewerker bedrijfsbureau hr',
    'verzuim- en reintegr','ontwikkelcoach','coordinator leren',
    'medewerker leeractiviteiten','researchmedewerker',
    'wetenschappelijk onderzoeker','medewerker vorm en beeld',
    'medewerker facturatie','medewerker rapid circle',
    'co\u00f6rdinator digituin','co\u00f6rdinator vgm',
    'co\u00f6rdinator salarisadm','co\u00f6rdinator west',
    'recruitment assistent','secretaris klachtencommissie',
    'lid clientenraad'].some(p => t.includes(p)))
    return 'Bedrijfsvoering';

  if (t.includes('secretaresse rvb')) return 'Secretariaat';

  if (['voedingsassistent','medewerker servicedienst','schoonma','facilitair',
    'catering','receptie','portier','chauffeur','magazijn','logistiek',
    'huishoud','keuken','linnenkamer','coord.adm.afd.voed',
    'assistent kunstcommissie','co\u00f6rdinator beheer','medewerker logistiek',
    'inkoopassistent','vrijwilliger','stagiair',
    'medewerker beveiliging','medewerker pati\u00ebntenvervoer',
    'servicemedewerker','kok','medewerker equans',
    'eerste medewerker gastenservice','medewerker instroom',
    'leerling toa','haio'].some(p => t.includes(p)))
    return 'Niet-medische ondersteuning';

  // Department fallback
  if (['mict','ict','accureon','i&a','informatisering'].some(p => d.includes(p))) return 'Bedrijfsvoering';
  if (['voeding','facilitair','catering','huisvesting','logistiek','schoonmaak','inkoop'].some(p => d.includes(p))) return 'Niet-medische ondersteuning';
  if (['secretariaat'].some(p => d.includes(p))) return 'Medisch secretariaat';
  if (['financ','control','communicatie','kwaliteit','juridisch','hrm','bestuur'].some(p => d.includes(p))) return 'Bedrijfsvoering';

  if (!title || title.trim() === '') return 'Technisch account';
  return 'Onbekend';
}

function classifyTechnicalAccount(sam, displayName, email, ouPath, description) {
  const s = (sam || '').toLowerCase();
  const dn = (displayName || '').toLowerCase();
  const e = (email || '').toLowerCase();
  const ou = (ouPath || '').toLowerCase();
  const desc = (description || '').toLowerCase();

  if (s.startsWith('healthmailbox') || dn.startsWith('healthmailbox')) return 'Exchange Health Mailbox';
  if (s.startsWith('al_') || ou.includes('autologon')) return 'Autologon account (PC)';
  if (s.startsWith('sa_') || ou.includes('service account')) return 'Service account';
  if (s.startsWith('fm_') || ou.includes('functional mailbox')) return 'Functionele mailbox';
  if (s.startsWith('lv_') || ou.includes('leverancier')) return 'Leverancier';
  if (s.startsWith('adm_') || ou.includes('admin user')) return 'Beheer account';
  if (ou.includes('functionele account')) return 'Functioneel account';
  if (desc.includes('noodkey') || desc.includes('break')) return 'Noodtoegang (break-glass)';
  if (s.startsWith('$') || s.startsWith('sm_')) return 'Systeem/gMSA account';
  if (ou.includes('linked users') && !e) return 'Gekoppeld account (geen e-mail)';

  return 'Overig technisch account';
}

function runConformityAnalysis() {
  const db = getDatabase();

  const allGroups = db.prepare('SELECT name, category, scope, member_count FROM groups').all();
  const allMemberships = db.prepare('SELECT group_name, member_name, member_type FROM memberships').all();
  const users = db.prepare('SELECT sam_account_name, title, department FROM users WHERE enabled = 1').all();
  const usersFullInfo = db.prepare('SELECT sam_account_name, title, department, display_name, email, ou_path, description FROM users WHERE enabled = 1').all();

  // FGA memberships per user
  const userFga = {};
  for (const m of allMemberships) {
    if (m.member_type !== 'user') continue;
    if (classifyGroup(m.group_name) !== 'fga') continue;
    if (!userFga[m.member_name]) userFga[m.member_name] = [];
    userFga[m.member_name].push(m.group_name);
  }

  // === 1. Group distribution by prefix ===
  const groupDistribution = {};
  for (const g of allGroups) {
    const type = classifyGroup(g.name);
    if (!groupDistribution[type]) groupDistribution[type] = { count: 0, examples: [] };
    groupDistribution[type].count++;
    if (groupDistribution[type].examples.length < 3) groupDistribution[type].examples.push(g.name);
  }

  // === 2. Nesting analysis ===
  const groupMemberships = allMemberships.filter(m => m.member_type === 'group');
  const userMemberships = allMemberships.filter(m => m.member_type === 'user');

  const nestingMatrix = {};
  const nestingViolations = [];

  for (const m of groupMemberships) {
    const parentType = classifyGroup(m.group_name);
    const childType = classifyGroup(m.member_name);
    const key = `${childType} \u2192 ${parentType}`;
    if (!nestingMatrix[key]) nestingMatrix[key] = { count: 0, examples: [] };
    nestingMatrix[key].count++;
    if (nestingMatrix[key].examples.length < 3) {
      nestingMatrix[key].examples.push({ child: m.member_name, parent: m.group_name });
    }

    // Check conformity
    const allowed =
      (CONTAINER_TYPES.includes(childType) && [...RESOURCE_TYPES, 'ctxr'].includes(parentType)) ||
      (childType === 'appl' && ['drvm', 'ntfs'].includes(parentType)) ||
      (childType === 'affu' && parentType === 'fga') ||
      (childType === 'afdl' && parentType === 'fga') ||
      (childType === 'plus' && parentType === 'plus') ||
      (childType === 'adm' && true) ||
      (childType === 'sec' && true) ||
      (parentType === 'adm' || parentType === 'sec') ||
      (childType === 'overig' || parentType === 'overig') ||
      (childType === 'func' || parentType === 'func') ||
      (childType === 'mg' || parentType === 'mg') ||
      (childType === 'cloud' || parentType === 'cloud') ||
      (childType === 'entra_sync' || parentType === 'entra_sync');

    // Specific violations
    const violation = detectViolationType(childType, parentType);
    if (violation) {
      nestingViolations.push({
        child: m.member_name,
        parent: m.group_name,
        childType,
        parentType,
        violation,
      });
    }
  }

  // === 3. Direct user-in-resource violations ===
  const directUserViolations = {};
  for (const m of userMemberships) {
    const groupType = classifyGroup(m.group_name);
    if (RESOURCE_TYPES.includes(groupType)) {
      if (!directUserViolations[groupType]) directUserViolations[groupType] = { count: 0, groups: {}, examples: [] };
      directUserViolations[groupType].count++;
      directUserViolations[groupType].groups[m.group_name] = (directUserViolations[groupType].groups[m.group_name] || 0) + 1;
      if (directUserViolations[groupType].examples.length < 5) {
        directUserViolations[groupType].examples.push({ user: m.member_name, group: m.group_name });
      }
    }
  }

  // Top groups per violation type
  for (const type of Object.keys(directUserViolations)) {
    const sorted = Object.entries(directUserViolations[type].groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    directUserViolations[type].topGroups = sorted.map(([name, count]) => ({ name, count }));
  }

  // === 4. User type distribution ===
  const userDirectTypes = {};
  for (const m of userMemberships) {
    const type = classifyGroup(m.group_name);
    if (!userDirectTypes[type]) userDirectTypes[type] = { count: 0, users: new Set() };
    userDirectTypes[type].count++;
    userDirectTypes[type].users.add(m.member_name);
  }
  const userTypesSummary = {};
  for (const [type, data] of Object.entries(userDirectTypes)) {
    userTypesSummary[type] = {
      memberships: data.count,
      uniqueUsers: data.users.size,
      allowed: [...CONTAINER_TYPES, 'overig', 'adm', 'sec', 'func', 'mg', 'cloud', 'entra_sync'].includes(type),
    };
  }

  // === 5. FGA coverage ===
  const usersInFga = new Set();
  for (const m of userMemberships) {
    if (classifyGroup(m.group_name) === 'fga') usersInFga.add(m.member_name);
  }

  // === 6. Nesting depth impact ===
  const depthDistribution = db.prepare(
    'SELECT depth, COUNT(*) as count FROM effective_memberships GROUP BY depth ORDER BY depth'
  ).all();

  // === 7. Entra-synced groups ===
  const entraSyncGroups = allGroups.filter(g => classifyGroup(g.name) === 'entra_sync');

  // === 8. Persona distribution ===
  const personas = {};
  for (const u of users) {
    const fgas = userFga[u.sam_account_name] || [];
    const persona = classifyPersona(u.title, u.department, fgas);
    if (!personas[persona]) personas[persona] = { count: 0, titles: {}, departments: {} };
    personas[persona].count++;
    if (u.title) {
      personas[persona].titles[u.title] = (personas[persona].titles[u.title] || 0) + 1;
    }
    if (u.department) {
      personas[persona].departments[u.department] = (personas[persona].departments[u.department] || 0) + 1;
    }
  }

  // Summarize personas
  const personaSummary = {};
  for (const [name, data] of Object.entries(personas)) {
    const topTitles = Object.entries(data.titles)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([t, c]) => ({ title: t, count: c }));
    const topDepts = Object.entries(data.departments)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([d, c]) => ({ department: d, count: c }));
    personaSummary[name] = { count: data.count, topTitles, topDepts };
  }

  // === 9. affu-in-FGA detail ===
  const affuInFga = groupMemberships
    .filter(m => classifyGroup(m.member_name) === 'affu' && classifyGroup(m.group_name) === 'fga');
  const affuByFga = {};
  for (const m of affuInFga) {
    if (!affuByFga[m.group_name]) affuByFga[m.group_name] = [];
    affuByFga[m.group_name].push(m.member_name);
  }

  // === 10. Technical account breakdown ===
  const technicalBreakdown = {};
  for (const u of usersFullInfo) {
    const fgas = userFga[u.sam_account_name] || [];
    const persona = classifyPersona(u.title, u.department, fgas);
    if (persona === 'Technisch account') {
      const subType = classifyTechnicalAccount(u.sam_account_name, u.display_name, u.email, u.ou_path, u.description);
      if (!technicalBreakdown[subType]) technicalBreakdown[subType] = { count: 0, examples: [] };
      technicalBreakdown[subType].count++;
      if (technicalBreakdown[subType].examples.length < 3) {
        technicalBreakdown[subType].examples.push({
          sam: u.sam_account_name,
          displayName: u.display_name || '',
          ou: u.ou_path || '',
        });
      }
    }
  }

  // === 11. Human vs technical user count ===
  const humanUsers = users.length - (personaSummary['Technisch account']?.count || 0);


  return {
    totalGroups: allGroups.length,
    totalMemberships: allMemberships.length,
    totalUsers: users.length,
    humanUsers,
    groupDistribution,
    nestingMatrix,
    nestingViolations,
    directUserViolations,
    userTypesSummary,
    fgaCoverage: {
      totalActive: users.length,
      inFga: usersInFga.size,
      withoutFga: users.length - usersInFga.size,
    },
    depthDistribution,
    entraSyncGroups: {
      count: entraSyncGroups.length,
      examples: entraSyncGroups.slice(0, 10).map(g => g.name),
    },
    personaSummary,
    technicalBreakdown,
    affuByFga,
    summary: buildSummary(nestingViolations, directUserViolations, entraSyncGroups, depthDistribution, usersInFga.size, users.length),
  };
}

function detectViolationType(childType, parentType) {
  // Same-type nesting (forbidden)
  if (['appl', 'drvm', 'ntfs'].includes(parentType) && parentType === childType) {
    return 'soortgenoot';
  }
  // Resource in container (reversed)
  if (RESOURCE_TYPES.includes(childType) && CONTAINER_TYPES.includes(parentType)) {
    return 'omgekeerd';
  }
  // affu/afdl in FGA is architecturally wrong (should be parallel)
  // Actually this IS in the original design per the description - affu nests in FGA
  // BUT: the user said this creates too much depth. Let's flag it as "diepte-veroorzaker"
  // Wait - re-reading the design: user IS member of affu AND fga separately.
  // affu should NOT be nested IN fga. They are parallel layers.
  if (childType === 'affu' && parentType === 'fga') return 'affu-in-fga';
  if (childType === 'afdl' && parentType === 'fga') return 'afdl-in-fga';

  return null;
}

function buildSummary(violations, directViolations, entraSyncGroups, depthDist, fgaCount, totalUsers) {
  const byType = {};
  for (const v of violations) {
    if (!byType[v.violation]) byType[v.violation] = 0;
    byType[v.violation]++;
  }

  const directTotal = Object.values(directViolations).reduce((s, v) => s + v.count, 0);
  const depth3plus = depthDist.filter(d => d.depth > 2).reduce((s, d) => s + d.count, 0);
  const totalEffective = depthDist.reduce((s, d) => s + d.count, 0);

  return {
    nestingToRemove: violations.length,
    nestingByType: byType,
    directUserViolations: directTotal,
    entraSyncToRemove: entraSyncGroups.length,
    depth3plusRelations: depth3plus,
    totalEffectiveRelations: totalEffective,
    reductionPct: totalEffective > 0 ? ((depth3plus / totalEffective) * 100).toFixed(1) : '0',
    fgaCoveragePct: totalUsers > 0 ? ((fgaCount / totalUsers) * 100).toFixed(1) : '0',
  };
}

module.exports = { runConformityAnalysis, classifyGroup, classifyPersona, CONTAINER_TYPES, RESOURCE_TYPES };
