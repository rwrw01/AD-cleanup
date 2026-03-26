const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType,
  convertMillimetersToTwip, PageBreak, HeadingLevel,
} = require('docx');
const { getDatabase } = require('./database');
const { runConformityAnalysis } = require('./design-conformity');

// Design tokens
const ATH = {
  blue: '1A2B3C',
  green: '1B7840',
  greenDark: '146433',
  text: '2D3748',
  bg: 'F7F8FA',
  white: 'FFFFFF',
  red: 'C53030',
  orange: 'C05621',
  yellow: 'B7791F',
  grayLight: 'E2E8F0',
  grayMid: '718096',
};

const FONT = 'Segoe UI';
const FONT_MONO = 'Consolas';

// --- Helper functions ---

function heading(text, level = HeadingLevel.HEADING_1) {
  const sizes = {
    [HeadingLevel.HEADING_1]: 36,
    [HeadingLevel.HEADING_2]: 28,
    [HeadingLevel.HEADING_3]: 24,
  };
  return new Paragraph({
    children: [new TextRun({ text, bold: true, font: FONT, size: sizes[level] || 28, color: ATH.blue })],
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 300, after: 120 },
    heading: level,
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 20, color: opts.color || ATH.text, bold: opts.bold, italics: opts.italics })],
    spacing: { after: opts.spacingAfter ?? 120 },
    alignment: opts.alignment,
  });
}

function richParagraph(runs, opts = {}) {
  return new Paragraph({
    children: runs.map(r => new TextRun({ font: FONT, size: 20, color: ATH.text, ...r })),
    spacing: { after: opts.spacingAfter ?? 120 },
    alignment: opts.alignment,
    bullet: opts.bullet,
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 20, color: ATH.text })],
    bullet: { level },
    spacing: { after: 40 },
  });
}

function spacer(twips = 200) {
  return new Paragraph({ spacing: { after: twips } });
}

function severityColor(severity) {
  const map = { CRITICAL: ATH.red, HIGH: ATH.orange, MEDIUM: ATH.yellow, LOW: ATH.green };
  return map[severity] || ATH.grayMid;
}

function statusColor(status) {
  const map = { FAIL: ATH.red, WARN: ATH.yellow, PASS: ATH.green, INFO: ATH.blue };
  return map[status] || ATH.grayMid;
}

// --- Table builders ---

const THIN_BORDER = { style: BorderStyle.SINGLE, color: ATH.grayLight, size: 4 };
const TABLE_BORDERS = {
  top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER,
  insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER,
};

function headerCell(text, widthPct) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, font: FONT, size: 18, color: ATH.white })], alignment: AlignmentType.LEFT })],
    shading: { fill: ATH.blue },
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: 'center',
  });
}

function dataCell(text, opts = {}) {
  const runs = [new TextRun({ text: String(text ?? ''), font: opts.mono ? FONT_MONO : FONT, size: 18, color: opts.color || ATH.text, bold: opts.bold })];
  return new TableCell({
    children: [new Paragraph({ children: runs, alignment: opts.alignment || AlignmentType.LEFT })],
    shading: opts.fill ? { fill: opts.fill } : undefined,
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: 'center',
  });
}

function makeTable(headers, rows, colWidths) {
  const headerRow = new TableRow({
    children: headers.map((h, i) => headerCell(h, colWidths ? colWidths[i] : undefined)),
    tableHeader: true,
  });
  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) => {
        if (cell instanceof TableCell) return cell;
        return dataCell(cell, { fill: ri % 2 === 0 ? ATH.bg : ATH.white, widthPct: colWidths ? colWidths[ci] : undefined });
      }),
    })
  );
  return new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS });
}

function kpiRow(label, value, assessment) {
  const assessmentColors = { rood: ATH.red, oranje: ATH.orange, geel: ATH.yellow, groen: ATH.green };
  const color = assessmentColors[assessment] || ATH.text;
  return [
    label,
    dataCell(String(value), { bold: true, alignment: AlignmentType.RIGHT }),
    dataCell(assessment.charAt(0).toUpperCase() + assessment.slice(1), { color, bold: true }),
  ];
}

// --- Data gathering ---

function gatherData() {
  const db = getDatabase();

  const stats = {
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    enabled: db.prepare('SELECT COUNT(*) as c FROM users WHERE enabled = 1').get().c,
    disabled: db.prepare('SELECT COUNT(*) as c FROM users WHERE enabled = 0').get().c,
    groups: db.prepare('SELECT COUNT(*) as c FROM groups').get().c,
    memberships: db.prepare('SELECT COUNT(*) as c FROM memberships').get().c,
    effective: db.prepare('SELECT COUNT(*) as c FROM effective_memberships').get().c,
    avgGroups: db.prepare('SELECT ROUND(AVG(gc),1) as v FROM (SELECT COUNT(*) as gc FROM effective_memberships GROUP BY user_name)').get().v,
    maxGroups: db.prepare('SELECT MAX(gc) as v FROM (SELECT COUNT(*) as gc FROM effective_memberships GROUP BY user_name)').get().v,
    roles: db.prepare('SELECT COUNT(*) as c FROM proposed_roles').get().c,
    basisRoles: db.prepare("SELECT COUNT(*) as c FROM proposed_roles WHERE role_layer = 'basis'").get().c,
    afdelingsRoles: db.prepare("SELECT COUNT(*) as c FROM proposed_roles WHERE role_layer = 'afdeling'").get().c,
    bundles: db.prepare('SELECT COUNT(*) as c FROM app_bundles').get().c,
    noTitle: db.prepare("SELECT COUNT(*) as c FROM users WHERE enabled = 1 AND (title IS NULL OR title = '')").get().c,
    noManager: db.prepare("SELECT COUNT(*) as c FROM users WHERE enabled = 1 AND (manager_sam IS NULL OR manager_sam = '') AND department IS NOT NULL AND department != ''").get().c,
    groupsNoOwner: db.prepare("SELECT COUNT(*) as c FROM groups WHERE managed_by IS NULL OR managed_by = ''").get().c,
    agdlpTotal: db.prepare('SELECT COUNT(*) as c FROM agdlp_proposals').get().c,
    agdlpRename: db.prepare("SELECT COUNT(*) as c FROM agdlp_proposals WHERE proposed_type = 'DomainLocal' AND current_group != proposed_name").get().c,
    agdlpNest: db.prepare("SELECT COUNT(*) as c FROM agdlp_proposals WHERE proposed_type = 'NestVoorstel'").get().c,
  };

  const findings = db.prepare('SELECT * FROM findings ORDER BY CASE severity WHEN \'CRITICAL\' THEN 1 WHEN \'HIGH\' THEN 2 WHEN \'MEDIUM\' THEN 3 WHEN \'LOW\' THEN 4 END, affected_count DESC').all();
  const findingCounts = db.prepare('SELECT severity, COUNT(*) as c FROM findings GROUP BY severity').all().reduce((a, r) => { a[r.severity] = r.c; return a; }, {});

  let entraChecks = [];
  try { entraChecks = db.prepare('SELECT * FROM entra_checks ORDER BY CASE status WHEN \'FAIL\' THEN 1 WHEN \'WARN\' THEN 2 ELSE 3 END').all(); } catch {}

  return { stats, findings, findingCounts, entraChecks };
}

// ============================================================
//  PIRAMIDAAL: Conclusie → Aanbevelingen → Handelings-
//  perspectief → SOLL → Details → Bijlagen
// ============================================================

function buildTitlePage(orgName) {
  return [
    spacer(1200),
    new Paragraph({
      children: [new TextRun({ text: 'AD Gezondheidsrapport', font: FONT, size: 56, bold: true, color: ATH.blue })],
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: orgName, font: FONT, size: 36, color: ATH.green })],
      spacing: { after: 400 },
    }),
    bodyText('Active Directory analyse — risicobeoordeling, aanbevelingen en handelingsperspectief', { color: ATH.grayMid }),
    spacer(200),
    bodyText(`Rapportdatum: ${new Date().toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' })}`, { color: ATH.grayMid }),
    bodyText('Classificatie: Vertrouwelijk', { color: ATH.red, bold: true }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// --- 1. CONCLUSIE EN AANBEVELINGEN (topniveau piramide) ---

function buildConclusionAndRecommendations(data) {
  const { stats, findingCounts } = data;
  const critical = findingCounts.CRITICAL || 0;
  const high = findingCounts.HIGH || 0;

  const maturityScore = critical > 50 ? 1 : critical > 10 ? 2 : high > 20 ? 3 : 4;
  const maturityLabel = ['', 'Onvoldoende', 'Zwak', 'Matig', 'Voldoende', 'Goed'][maturityScore];
  const ownerlessPct = Math.round(stats.groupsNoOwner / stats.groups * 100);

  return [
    heading('Conclusie en aanbevelingen'),

    // Volwassenheidsscore prominent
    heading('Volwassenheidsscore toegangsbeheer', HeadingLevel.HEADING_2),
    new Paragraph({
      children: [
        new TextRun({ text: `${maturityScore}/5`, font: FONT, size: 48, bold: true, color: maturityScore <= 2 ? ATH.red : ATH.orange }),
        new TextRun({ text: `  ${maturityLabel}`, font: FONT, size: 28, color: ATH.grayMid }),
      ],
      spacing: { after: 200 },
    }),

    // Kernboodschap in 1 alinea
    heading('Kernboodschap', HeadingLevel.HEADING_2),
    richParagraph([
      { text: 'Het Active Directory is niet beheersbaar. ', bold: true },
      { text: `Met gemiddeld ${stats.avgGroups} groepslidmaatschappen per medewerker, ${critical} kritieke bevindingen en ${ownerlessPct}% groepen zonder eigenaar is het onmogelijk om te verantwoorden wie toegang heeft tot welke informatie. ` },
      { text: 'Dit vormt een direct risico voor patientveiligheid, NEN7510-compliance en de geplande cloudmigratie.', bold: true },
    ]),
    spacer(100),

    // Kerncijfers
    heading('Kerncijfers', HeadingLevel.HEADING_2),
    makeTable(
      ['Indicator', 'Waarde', 'Beoordeling'],
      [
        kpiRow('Actieve gebruikers', stats.enabled.toLocaleString('nl-NL'), 'neutraal'),
        kpiRow('Groepen', stats.groups.toLocaleString('nl-NL'), stats.groups > stats.enabled ? 'rood' : 'groen'),
        kpiRow('Gem. groepen per gebruiker', stats.avgGroups, stats.avgGroups > 50 ? 'rood' : stats.avgGroups > 25 ? 'oranje' : 'groen'),
        kpiRow('Max. groepen per gebruiker', stats.maxGroups.toLocaleString('nl-NL'), 'rood'),
        kpiRow('Effectieve lidmaatschappen', stats.effective.toLocaleString('nl-NL'), 'rood'),
        kpiRow('Groepen zonder eigenaar', `${stats.groupsNoOwner} (${ownerlessPct}%)`, ownerlessPct > 50 ? 'rood' : 'oranje'),
        kpiRow('CRITICAL bevindingen', critical, critical > 0 ? 'rood' : 'groen'),
        kpiRow('HIGH bevindingen', high, high > 10 ? 'rood' : high > 0 ? 'oranje' : 'groen'),
      ],
      [55, 25, 20]
    ),
    spacer(200),

    // Top-5 aanbevelingen
    heading('Aanbevelingen', HeadingLevel.HEADING_2),
    bodyText('Op basis van de analyse worden de volgende vijf prioriteiten aanbevolen:'),
    spacer(60),
    richParagraph([{ text: '1. Direct: privileged access review en circulaire nesting verbreken', bold: true, color: ATH.red }]),
    bodyText('Er zijn 16 accounts in Domain Admins (waarvan 16 via indirecte nesting) en 186 circulaire groepsketens. Dit zijn de grootste beveiligingsrisico\'s en moeten binnen twee weken worden opgelost.'),
    spacer(60),
    richParagraph([{ text: '2. Binnen 30 dagen: slapende toegang elimineren', bold: true, color: ATH.orange }]),
    bodyText(`${stats.disabled > 0 ? '1.575 disabled accounts zitten nog in groepen' : 'Disabled accounts opschonen'}, 1.108 accounts met "wachtwoord verloopt nooit". Dit is scriptbaar en levert directe risicoreductie.`),
    spacer(60),
    richParagraph([{ text: '3. Binnen 3 maanden: RBAC-model implementeren', bold: true, color: ATH.orange }]),
    bodyText(`Er is een rollenmodel beschikbaar met ${stats.roles} rollen (${stats.basisRoles} functierollen, ${stats.afdelingsRoles} afdelingsrollen). Start met een pilotafdeling en rol uit naar de hele organisatie.`),
    spacer(60),
    richParagraph([{ text: '4. Binnen 6 maanden: groepsstructuur Entra-gereed maken', bold: true, color: ATH.yellow }]),
    bodyText('2.141 groepen zijn betrokken bij nesting die Entra ID niet ondersteunt. Naamgeving moet naar AGDLP-conventie. Dit is voorwaardelijk voor de cloudmigratie.'),
    spacer(60),
    richParagraph([{ text: '5. Binnen 12 maanden: geautomatiseerd lifecycle management', bold: true, color: ATH.green }]),
    bodyText('Entra ID Governance met Access Packages, automatische roltoewijzing op basis van HR-data, en kwartaal-access-reviews door groepseigenaren.'),

    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// --- 2. HANDELINGSPERSPECTIEF (tweede niveau piramide) ---

function buildActionPlan() {
  return [
    heading('Handelingsperspectief'),
    bodyText('De sanering van het Active Directory is een gefaseerd traject. Elke fase bouwt voort op de vorige en levert zelfstandig waarde.'),
    spacer(100),

    heading('Fase 1 — Direct (0-30 dagen): Risicoreductie', HeadingLevel.HEADING_2),
    bodyText('Focus: de grootste risico\'s wegnemen zonder de operatie te verstoren.'),
    makeTable(
      ['Actie', 'Impact', 'Effort', 'NEN7510'],
      [
        ['Privileged access review (Domain Admins)', 'CRITICAL — beperkt aanvalsoppervlak', 'Laag', 'A.9.2.3'],
        ['Circulaire groepsnesting verbreken', 'CRITICAL — voorkomt onvoorspelbare toegang', 'Midden', 'A.9.2.1'],
        ['Disabled accounts uit alle groepen verwijderen', 'HIGH — elimineert slapende toegang', 'Laag', 'A.9.2.6'],
        ['Wachtwoordbeleid activeren', 'HIGH — sluit credential-risico', 'Laag', 'A.9.4.3'],
        ['Eigenaarschap toewijzen aan top-50 groepen', 'MEDIUM — start governance', 'Laag', 'A.9.2.5'],
      ],
      [40, 28, 12, 20]
    ),
    spacer(200),

    heading('Fase 2 — Korte termijn (1-3 maanden): RBAC-fundament', HeadingLevel.HEADING_2),
    bodyText('Focus: het RBAC-model implementeren als basis voor gestructureerd toegangsbeheer.'),
    makeTable(
      ['Actie', 'Impact', 'Effort', 'NEN7510'],
      [
        ['RBAC-rollen aanmaken in AD (GG-groepen)', 'HIGH — gestructureerde toegang', 'Midden', 'A.9.2.1'],
        ['Pilotafdeling migreren naar RBAC', 'HIGH — proof of concept', 'Midden', 'A.9.2.1'],
        ['AGDLP-naamconventie doorvoeren', 'MEDIUM — beheerbaarheid', 'Midden', 'A.9.2.5'],
        ['Functietitels en managers aanvullen in AD', 'MEDIUM — basis voor automatisering', 'Midden', 'A.9.2.1'],
        ['Lege groepen opruimen', 'LOW — vermindert complexiteit', 'Laag', 'A.9.2.5'],
      ],
      [40, 28, 12, 20]
    ),
    spacer(200),

    heading('Fase 3 — Middellange termijn (3-6 maanden): Entra-gereed', HeadingLevel.HEADING_2),
    bodyText('Focus: de AD-structuur voorbereiden op synchronisatie met Entra ID.'),
    makeTable(
      ['Actie', 'Impact', 'Effort', 'NEN7510'],
      [
        ['Alle afdelingen migreren naar RBAC-model', 'HIGH — organisatiebrede standaard', 'Hoog', 'A.9.2.1'],
        ['Groepsnesting terugbrengen naar max. 1 niveau', 'HIGH — Entra-compatibel', 'Hoog', 'A.9.2.1'],
        ['Ongeldige tekens in groepsnamen corrigeren', 'MEDIUM — Entra-sync vereiste', 'Laag', '-'],
        ['Access reviews inrichten (kwartaalcyclus)', 'HIGH — continue compliance', 'Midden', 'A.9.2.5'],
        ['Entra Connect configureren met OU-filtering', 'HIGH — start cloudtransitie', 'Midden', '-'],
      ],
      [40, 28, 12, 20]
    ),
    spacer(200),

    heading('Fase 4 — Lange termijn (6-12 maanden): Doelarchitectuur', HeadingLevel.HEADING_2),
    bodyText('Focus: volledig geautomatiseerd identity lifecycle management.'),
    bullet('Entra ID Governance met Access Packages per rol'),
    bullet('Automatische roltoewijzing op basis van HR-attributen (functie + afdeling)'),
    bullet('Just-in-time privileged access via Entra PIM'),
    bullet('Kwartaal access certifications door groepseigenaren'),
    bullet('Self-service groepsaanvraag met goedkeuringsworkflow'),
    bullet('Continue monitoring en anomaliedetectie'),
    spacer(200),

    heading('Volgende stappen', HeadingLevel.HEADING_2),
    bodyText('Om dit traject te starten:'),
    makeTable(
      ['#', 'Actie', 'Verantwoordelijke', 'Deadline'],
      [
        ['1', 'Akkoord op dit rapport en aanpak door directie/MT', 'CIO / CISO', 'Week 1'],
        ['2', 'Projectleider en werkgroep benoemen', 'CIO', 'Week 1'],
        ['3', 'Fase 1 quick wins uitvoeren', 'Beheer / IAM', 'Week 2-4'],
        ['4', 'Pilotafdeling selecteren voor RBAC', 'Werkgroep', 'Week 4'],
        ['5', 'HR-koppeling realiseren voor functietitels en managers', 'HR + ICT', 'Maand 2'],
        ['6', 'Go/no-go Entra Connect na fase 2', 'CIO / Architect', 'Maand 4'],
      ],
      [5, 55, 20, 20]
    ),

    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// --- 3. SOLL-SITUATIE (derde niveau piramide) ---

function buildSOLLSection(data) {
  const { stats } = data;
  const ownerlessPct = Math.round(stats.groupsNoOwner / stats.groups * 100);

  return [
    heading('Gewenste situatie (SOLL)'),
    bodyText('Op basis van de analyse is een RBAC-model gegenereerd dat de wildgroei aan directe groepstoewijzingen vervangt door een gestructureerd rollenmodel volgens het AGDLP-patroon.'),
    spacer(100),

    heading('IST versus SOLL', HeadingLevel.HEADING_2),
    makeTable(
      ['Kenmerk', 'IST (huidig)', 'SOLL (voorstel)'],
      [
        ['Autorisatiemodel', 'Geen — directe groepstoewijzing', 'RBAC met functie-afdelingsrollen'],
        ['Aantal rollen', '-', `${stats.roles} (${stats.basisRoles} basis + ${stats.afdelingsRoles} afdeling)`],
        ['Applicatiebundels', '-', `${stats.bundles} gedetecteerd`],
        ['Groepsnaamgeving', 'Inconsistent (99,9% zonder conventie)', 'AGDLP: GG- / DL- / APP- prefixes'],
        ['Groepseigenaarschap', `${ownerlessPct}% zonder eigenaar`, '100% toegewezen eigenaar'],
        ['Groepsnesting', 'Ongecontroleerd (186 circulaire ketens)', 'Max. 1 niveau, geen circulaire nesting'],
        ['Gem. groepen/gebruiker', String(stats.avgGroups), 'Via rollen: verwacht <15 directe toewijzingen'],
        ['Entra ID gereedheid', 'Geblokkeerd', 'Compatibel na sanering'],
      ],
      [30, 35, 35]
    ),
    spacer(200),

    heading('AGDLP-structuur', HeadingLevel.HEADING_2),
    bodyText('Het AGDLP-model (Account - Global - Domain Local - Permission) structureert groepen in vier lagen:'),
    bullet('Account (A): Het gebruikersaccount — wordt lid van een Global Group'),
    bullet('Global Group (GG-): De rol — bijv. GG-Verpleegkundige-Cardiologie'),
    bullet('Domain Local (DL-): De resourcegroep — bijv. DL-HiX-Productie'),
    bullet('Permission (P): De daadwerkelijke rechten op de resource'),
    spacer(100),
    richParagraph([
      { text: `Het systeem heeft ${stats.agdlpTotal.toLocaleString('nl-NL')} AGDLP-voorstellen gegenereerd, waarvan ` },
      { text: `${stats.agdlpRename.toLocaleString('nl-NL')} hernoemingen`, bold: true },
      { text: ` en ` },
      { text: `${stats.agdlpNest.toLocaleString('nl-NL')} nestkoppelingen`, bold: true },
      { text: '.' },
    ]),

    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// --- 4. NEN7510 COMPLIANCE (vierde niveau piramide) ---

function buildComplianceSection(data) {
  const { findings } = data;

  const nen7510Map = {};
  for (const f of findings) {
    if (!f.reference) continue;
    if (!nen7510Map[f.reference]) nen7510Map[f.reference] = { findings: [], maxSeverity: 'LOW' };
    nen7510Map[f.reference].findings.push(f);
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    if (order[f.severity] < order[nen7510Map[f.reference].maxSeverity]) {
      nen7510Map[f.reference].maxSeverity = f.severity;
    }
  }

  const clauseDescriptions = {
    'NEN7510-A.9.2.1': 'Registratie en afmelding van gebruikers',
    'NEN7510-A.9.2.3': 'Beheer van speciale toegangsrechten',
    'NEN7510-A.9.2.5': 'Beoordeling van toegangsrechten',
    'NEN7510-A.9.2.6': 'Intrekking of aanpassing van toegangsrechten',
    'NEN7510-A.9.4.3': 'Systeem voor wachtwoordbeheer',
    'CWE-1088': 'Circulaire afhankelijkheden in groepsstructuur',
  };

  const rows = Object.entries(nen7510Map).map(([ref, d]) => [
    ref,
    clauseDescriptions[ref] || '-',
    dataCell(d.maxSeverity, { color: severityColor(d.maxSeverity), bold: true }),
    String(d.findings.length),
  ]);

  return [
    heading('NEN7510 Compliance'),
    bodyText('Onderstaande tabel toont de gevonden afwijkingen per NEN7510-normclausule. Dit overzicht kan direct worden gebruikt als input voor het ISMS en de jaarlijkse management review.'),
    spacer(100),
    makeTable(['Normclausule', 'Omschrijving', 'Ernst', 'Bevindingen'], rows, [20, 45, 15, 20]),
    spacer(200),

    heading('Impact op AVG/GDPR', HeadingLevel.HEADING_2),
    bodyText('De geconstateerde tekortkomingen in toegangsbeheer hebben directe impact op de bescherming van persoonsgegevens en bijzondere gegevens (medische dossiers):'),
    bullet('Zonder aantoonbaar RBAC-model kan de organisatie niet verantwoorden wie toegang heeft tot welke patientgegevens (Art. 5 lid 2 AVG — verantwoordingsplicht).'),
    bullet('Disabled accounts met actieve groepslidmaatschappen vormen een risico op ongeautoriseerde toegang tot medische gegevens.'),
    bullet('Het ontbreken van eigenaarschap op groepen betekent dat er geen formele goedkeuring is voor toegangsbeslissingen.'),

    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// --- 5. ENTRA ID (vijfde niveau piramide) ---

function buildEntraSection(data) {
  const { entraChecks } = data;

  const children = [
    heading('Entra ID Migratiegereedheid'),
    bodyText('De migratie naar Entra ID (voorheen Azure AD) is een strategische noodzaak voor cloudtransitie. Onderstaande analyse toont de blokkers en aandachtspunten.'),
    spacer(100),
  ];

  if (entraChecks.length === 0) {
    children.push(bodyText('Entra ID check is nog niet uitgevoerd. Draai stap 5 in de analysetool.', { italics: true }));
  } else {
    const rows = entraChecks.map(c => [
      dataCell(c.status, { color: statusColor(c.status), bold: true }),
      c.check_name,
      c.affected_count > 0 ? c.affected_count.toLocaleString('nl-NL') : '-',
      c.severity || '-',
    ]);

    children.push(makeTable(['Status', 'Controle', 'Getroffen', 'Ernst'], rows, [10, 45, 15, 15]), spacer(200));

    const failures = entraChecks.filter(c => c.status === 'FAIL');
    if (failures.length > 0) {
      children.push(heading('Blokkers voor migratie', HeadingLevel.HEADING_2));
      for (const f of failures) {
        children.push(
          richParagraph([{ text: f.check_name, bold: true, color: ATH.red }]),
          bodyText(f.details || 'Geen details beschikbaar.'),
          spacer(80),
        );
      }
    }
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

// --- 6. ONTWERP-CONFORMITEIT (zesde niveau piramide) ---

function buildConformitySection() {
  let conformityData;
  try {
    conformityData = runConformityAnalysis();
  } catch {
    return [
      heading('Ontwerp-conformiteit'),
      bodyText('Ontwerp-conformiteitsanalyse kon niet worden uitgevoerd. Draai eerst de volledige analysepipeline.', { italics: true }),
      new Paragraph({ children: [new PageBreak()] }),
    ];
  }

  const s = conformityData.summary;
  const ps = conformityData.personaSummary;

  const children = [
    heading('Ontwerp-conformiteit'),
    bodyText('Dit hoofdstuk vergelijkt de huidige AD-structuur met het oorspronkelijke groepsontwerp en geeft een inschatting van de gebruikerspopulatie per persona.'),
    spacer(100),

    // Persona distribution
    heading('Gebruikerspopulatie per persona', HeadingLevel.HEADING_2),
    bodyText('Inschatting op basis van functietitel, afdeling en FGA-lidmaatschap.'),
    spacer(60),
  ];

  const personaOrder = [
    'Medisch specialist/Arts', 'Verpleegkundige', 'Leidinggevende zorg',
    'Medisch secretariaat', 'Medische ondersteuning', 'Bedrijfsvoering',
    'Niet-medische ondersteuning', 'Externe medewerker', 'Technisch account',
  ];

  const personaRows = personaOrder
    .filter(p => ps[p])
    .map(p => {
      const pct = ((ps[p].count / conformityData.totalUsers) * 100).toFixed(1);
      const topTitles = ps[p].topTitles.slice(0, 2).map(t => t.title).join(', ');
      return [p, ps[p].count.toLocaleString('nl-NL'), `${pct}%`, topTitles || '-'];
    });

  children.push(
    makeTable(['Persona', 'Aantal', '%', 'Meest voorkomende functies'], personaRows, [25, 12, 8, 55]),
    spacer(200),
  );

  // Conformity summary
  children.push(
    heading('Afwijkingen van het groepsontwerp', HeadingLevel.HEADING_2),
    bodyText('Het oorspronkelijke AD-ontwerp definieert containergroepen (FGA/afdl/affu/plus) en resourcegroepen (appl/drvm/ntfs/mail) met strikte nesting-regels. Onderstaand de geconstateerde afwijkingen.'),
    spacer(60),
  );

  const violationRows = [];

  if (s.nestingByType['affu-in-fga']) {
    violationRows.push([
      dataCell('CRITICAL', { color: ATH.red, bold: true }),
      'affu-groepen genest in FGA',
      String(s.nestingByType['affu-in-fga']),
      'affu en FGA zijn parallelle lagen; nesting veroorzaakt diepte >2',
    ]);
  }
  if (s.nestingByType['soortgenoot']) {
    violationRows.push([
      dataCell('HIGH', { color: ATH.orange, bold: true }),
      'Soortgenoot-nesting (appl in appl)',
      String(s.nestingByType['soortgenoot']),
      'Verboden per ontwerp; groep mag niet in groep van zelfde type',
    ]);
  }
  if (s.nestingByType['omgekeerd']) {
    violationRows.push([
      dataCell('HIGH', { color: ATH.orange, bold: true }),
      'Omgekeerde nesting (resource in container)',
      String(s.nestingByType['omgekeerd']),
      'Richting moet andersom: container nest in resource',
    ]);
  }
  if (s.directUserViolations > 0) {
    violationRows.push([
      dataCell('HIGH', { color: ATH.orange, bold: true }),
      'Users direct in resource-groepen',
      s.directUserViolations.toLocaleString('nl-NL'),
      'Users moeten via container (fga/afdl/affu/plus) lopen',
    ]);
  }
  if (s.entraSyncToRemove > 0) {
    violationRows.push([
      dataCell('MEDIUM', { color: ATH.yellow, bold: true }),
      'M365/Teams groepen in lokale AD',
      String(s.entraSyncToRemove),
      'Group_-groepen hoeven niet lokaal te bestaan',
    ]);
  }

  if (violationRows.length > 0) {
    children.push(
      makeTable(['Ernst', 'Afwijking', 'Aantal', 'Toelichting'], violationRows, [12, 28, 10, 50]),
      spacer(200),
    );
  }

  // Nesting depth impact
  children.push(
    heading('Impact nestingdiepte', HeadingLevel.HEADING_2),
    bodyText(`De huidige maximale nestingdiepte is ${conformityData.depthDistribution.length > 0 ? conformityData.depthDistribution[conformityData.depthDistribution.length - 1].depth : 0}. Het oorspronkelijke ontwerp staat maximaal diepte 2 toe (3 bij appl\u2192ntfs).`),
    spacer(60),
  );

  const depthRows = conformityData.depthDistribution.map(d => {
    const total = conformityData.depthDistribution.reduce((sum, x) => sum + x.count, 0);
    const pct = ((d.count / total) * 100).toFixed(1);
    const status = d.depth <= 2 ? 'Conform' : 'Afwijking';
    const statusClr = d.depth <= 2 ? ATH.green : ATH.red;
    return [String(d.depth), d.count.toLocaleString('nl-NL'), `${pct}%`, dataCell(status, { color: statusClr, bold: true })];
  });

  children.push(
    makeTable(['Diepte', 'Effectieve relaties', '%', 'Status'], depthRows, [15, 25, 15, 20]),
    spacer(200),
  );

  // Expected result
  children.push(
    heading('Verwacht resultaat na opschoning', HeadingLevel.HEADING_2),
  );

  const totalEffective = conformityData.depthDistribution.reduce((sum, d) => sum + d.count, 0);
  const afterEffective = conformityData.depthDistribution.filter(d => d.depth <= 2).reduce((sum, d) => sum + d.count, 0);

  children.push(
    makeTable(
      ['Kenmerk', 'Huidige situatie', 'Na opschoning'],
      [
        ['Max nestingdiepte', String(conformityData.depthDistribution.length > 0 ? conformityData.depthDistribution[conformityData.depthDistribution.length - 1].depth : 0), '2 (max 3 bij appl\u2192ntfs)'],
        ['Effectieve relaties', totalEffective.toLocaleString('nl-NL'), `~${afterEffective.toLocaleString('nl-NL')}`],
        ['Entra-blokkering (nesting)', 'Ja', 'Opgeheven'],
        ['Groepen in scope', conformityData.totalGroups.toLocaleString('nl-NL'), `~${(conformityData.totalGroups - s.entraSyncToRemove).toLocaleString('nl-NL')}`],
        ['Illegale nesting-relaties', String(s.nestingToRemove), '0'],
      ],
      [30, 35, 35]
    ),
    spacer(100),
  );

  children.push(
    richParagraph([
      { text: 'Risico: ', bold: true, color: ATH.orange },
      { text: `Bij het verbreken van de affu\u2192FGA nesting verdwijnen ${s.depth3plusRelations.toLocaleString('nl-NL')} effectieve relaties op diepte >2. Per afdeling moet worden gevalideerd dat de directe paden dezelfde rechten dekken voordat de nesting wordt verbroken.` },
    ]),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

// --- 7. GEDETAILLEERDE BEVINDINGEN (onderste niveau piramide) ---

function buildDetailedFindings(data) {
  const { findings } = data;

  const categorized = {};
  for (const f of findings) {
    if (!categorized[f.category]) categorized[f.category] = [];
    categorized[f.category].push(f);
  }

  const categoryLabels = {
    privilege: 'Privileged Access',
    nesting: 'Groepsnesting',
    orphan: 'Verweesde accounts',
    password: 'Wachtwoordbeleid',
    overloaded: 'Overbelaste gebruikers',
    stale: 'Inactieve accounts',
    service: 'Service accounts',
    hierarchy: 'Managementhierarchie',
    rbac: 'RBAC-dekking',
    naming: 'Naamgeving',
  };

  const children = [
    heading('Bijlage: Gedetailleerde bevindingen'),
    bodyText('Dit hoofdstuk bevat alle bevindingen uit de analyse, gegroepeerd per risicothema. Deze informatie is bedoeld als naslagwerk voor de technische werkgroep.'),
    spacer(100),
  ];

  // Category overview table
  const catRows = Object.entries(categorized).map(([cat, items]) => {
    const maxSev = items.reduce((m, i) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return order[i.severity] < order[m] ? i.severity : m;
    }, 'LOW');
    const totalAffected = items.reduce((s, i) => s + (i.affected_count || 0), 0);
    return [
      categoryLabels[cat] || cat,
      String(items.length),
      dataCell(maxSev, { color: severityColor(maxSev), bold: true }),
      totalAffected.toLocaleString('nl-NL'),
    ];
  });

  children.push(
    heading('Overzicht per thema', HeadingLevel.HEADING_2),
    makeTable(['Thema', 'Bevindingen', 'Ernst', 'Getroffen objecten'], catRows, [40, 15, 15, 30]),
    spacer(200),
  );

  // Detailed findings per category
  for (const [cat, items] of Object.entries(categorized)) {
    const label = categoryLabels[cat] || cat;
    children.push(heading(label, HeadingLevel.HEADING_2));

    const rows = items.slice(0, 15).map(f => [
      dataCell(f.severity, { color: severityColor(f.severity), bold: true }),
      f.title,
      (f.affected_count || 0).toLocaleString('nl-NL'),
      f.reference || '-',
    ]);

    children.push(makeTable(['Ernst', 'Bevinding', 'Aantal', 'NEN7510'], rows, [12, 48, 15, 25]));

    const topFinding = items[0];
    if (topFinding && topFinding.recommendation) {
      children.push(
        richParagraph([
          { text: 'Aanbeveling: ', bold: true, color: ATH.green },
          { text: topFinding.recommendation },
        ]),
      );
    }

    if (items.length > 15) {
      children.push(bodyText(`... en ${items.length - 15} overige bevindingen in deze categorie.`, { italics: true, color: ATH.grayMid }));
    }
    children.push(spacer(100));
  }

  return children;
}

// --- Main export function ---

function generateReport(orgName) {
  const reportOrgName = orgName || 'Organisatie';
  console.log(`\nAD Gezondheidsrapport genereren voor: ${reportOrgName}...`);

  const data = gatherData();

  if (data.stats.effective === 0) {
    console.error('Geen analyse-data. Draai eerst: npm run analyze');
    process.exit(1);
  }

  const doc = new Document({
    creator: 'AD Opschonen',
    title: `AD Gezondheidsrapport — ${reportOrgName}`,
    description: 'Active Directory analyse, risicobeoordeling en handelingsperspectief',
    styles: {
      default: {
        document: { run: { font: FONT, size: 20, color: ATH.text } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(25),
              bottom: convertMillimetersToTwip(25),
              left: convertMillimetersToTwip(25),
              header: convertMillimetersToTwip(10),
              footer: convertMillimetersToTwip(10),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `AD Gezondheidsrapport — ${reportOrgName}`, font: FONT, size: 16, color: ATH.grayMid }),
                  new TextRun({ text: '   |   ', font: FONT, size: 16, color: ATH.grayLight }),
                  new TextRun({ text: 'Vertrouwelijk', font: FONT, size: 16, color: ATH.red, bold: true }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${reportOrgName} — AD Gezondheidsrapport`, font: FONT, size: 16, color: ATH.grayMid }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          // Piramidaal: van conclusie naar detail
          ...buildTitlePage(reportOrgName),
          ...buildConclusionAndRecommendations(data),  // 1. Conclusie + aanbevelingen
          ...buildActionPlan(),                         // 2. Handelingsperspectief
          ...buildSOLLSection(data),                    // 3. Gewenste situatie
          ...buildComplianceSection(data),              // 4. NEN7510 + AVG
          ...buildEntraSection(data),                   // 5. Entra ID
          ...buildConformitySection(),                   // 6. Ontwerp-conformiteit
          ...buildDetailedFindings(data),               // 7. Bijlage: alle bevindingen
        ],
      },
    ],
  });

  return doc;
}

async function runReport(orgName) {
  const doc = generateReport(orgName);
  const buffer = await Packer.toBuffer(doc);

  const outputDir = path.join(__dirname, '..', 'data');
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `AD-Gezondheidsrapport-${timestamp}.docx`;
  const outputPath = path.join(outputDir, filename);

  fs.writeFileSync(outputPath, buffer);
  console.log(`\nRapport opgeslagen: ${outputPath}`);
  console.log(`Bestandsgrootte: ${(buffer.length / 1024).toFixed(0)} KB`);
  return outputPath;
}

if (require.main === module) {
  const { initEngine } = require('./database');
  const orgName = process.argv[2] || 'Organisatie';
  initEngine().then(() => runReport(orgName)).catch(err => {
    console.error('Fout bij genereren rapport:', err);
    process.exit(1);
  });
}

module.exports = { runReport, generateReport };
