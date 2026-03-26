const { renderLayout } = require('./layout');

function render() {
  const body = `
    <h1>Gebruikersgids</h1>
    <p style="color:#858585;margin-bottom:20px;">Welkom bij AD Opschonen. Deze gids helpt je bij het gebruik van de applicatie.</p>

    <div class="conf-tabs" style="display:flex; gap:0; border-bottom:2px solid #3c3c3c; margin-bottom:20px;">
      <button class="conf-tab-btn active" data-tab="stappen" onclick="showTab('stappen')">Werkwijze</button>
      <button class="conf-tab-btn" data-tab="begrippen" onclick="showTab('begrippen')">Begrippen</button>
      <button class="conf-tab-btn" data-tab="groepsontwerp" onclick="showTab('groepsontwerp')">Groepsontwerp</button>
      <button class="conf-tab-btn" data-tab="privacy" onclick="showTab('privacy')">Privacy & beveiliging</button>
      <button class="conf-tab-btn" data-tab="faq" onclick="showTab('faq')">Veelgestelde vragen</button>
    </div>
    <style>
      .conf-tab-btn { padding:10px 20px; color:#858585; background:none; border:none; border-bottom:2px solid transparent; font-size:13px; cursor:pointer; font-family:inherit; margin-bottom:-2px; }
      .conf-tab-btn:hover { color:#cccccc; background:#2a2d2e; }
      .conf-tab-btn.active { color:#ffffff; border-bottom-color:#4fc1ff; }
      .conf-tab-content { display:none; }
      .help-card { background:#252526; border:1px solid #3c3c3c; border-radius:4px; padding:16px; margin-bottom:12px; }
      .help-card h3 { margin-top:0; }
      .help-step { display:flex; gap:16px; margin-bottom:16px; }
      .help-step-num { display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:#0e639c; color:#fff; font-weight:700; font-size:16px; flex-shrink:0; }
      .help-step-content { flex:1; }
      .help-step-content h3 { margin:0 0 4px; font-size:14px; color:#e0e0e0; }
      .help-step-content p { margin:0; font-size:13px; color:#858585; }
    </style>

    <!-- TAB: Werkwijze -->
    <div id="tab-stappen" class="conf-tab-content" style="display:block;">
      <h2>Werkwijze in 7 stappen</h2>

      <div class="help-step">
        <div class="help-step-num">1</div>
        <div class="help-step-content">
          <h3>AD-gegevens exporteren</h3>
          <p>Ga naar <a href="/import">Import</a> en gebruik de PowerShell-export of upload CSV-bestanden. De export vereist een werkstation met RSAT ActiveDirectory module. Gebruik <code>MaxResults: 100</code> om eerst te testen met een subset.</p>
        </div>
      </div>

      <div class="help-step">
        <div class="help-step-num">2</div>
        <div class="help-step-content">
          <h3>Analyse uitvoeren</h3>
          <p>Klik op <strong>Analyse uitvoeren</strong> op de importpagina. De tool detecteert 10 categorieen problemen: circulaire nesting, privileged access, slapende accounts, wachtwoordbeleid en meer.</p>
        </div>
      </div>

      <div class="help-step">
        <div class="help-step-num">3</div>
        <div class="help-step-content">
          <h3>RBAC-voorstel genereren</h3>
          <p>Genereert rollen op basis van functietitel en afdeling. Het algoritme clustert gebruikers en berekent gemeenschappelijke groepen. Daarnaast worden applicatiebundels en AGDLP-herstructurering voorgesteld.</p>
        </div>
      </div>

      <div class="help-step">
        <div class="help-step-num">4</div>
        <div class="help-step-content">
          <h3>IST/SOLL simulatie</h3>
          <p>Vergelijkt de huidige groepstoewijzingen met het RBAC-voorstel per gebruiker. Toont welke toegang behouden, toegevoegd of verwijderd wordt. Gebruikers met toegangsverlies worden per afdeling gemarkeerd.</p>
        </div>
      </div>

      <div class="help-step">
        <div class="help-step-num">5</div>
        <div class="help-step-content">
          <h3>Entra ID check</h3>
          <p>Controleert of de AD-structuur gesynchroniseerd kan worden naar Entra ID. Toont blokkers (nesting, ongeldige tekens) en genereert Access Package en Dynamic Group voorstellen.</p>
        </div>
      </div>

      <div class="help-step">
        <div class="help-step-num">6</div>
        <div class="help-step-content">
          <h3>Ontwerp-conformiteit bekijken</h3>
          <p>Ga naar <a href="/conformity">Ontwerp-check</a> om de huidige structuur te vergelijken met het oorspronkelijke groepsontwerp. Toont persona-verdeling, nesting-schendingen en een actieplan.</p>
        </div>
      </div>

      <div class="help-step">
        <div class="help-step-num">7</div>
        <div class="help-step-content">
          <h3>Rapport genereren</h3>
          <p>Ga naar <a href="/export">Rapport</a> om een Word-document (DOCX) te genereren. Bevat management samenvatting, NEN7510-compliance, ontwerp-conformiteit en handelingsperspectief.</p>
        </div>
      </div>
    </div>

    <!-- TAB: Begrippen -->
    <div id="tab-begrippen" class="conf-tab-content">
      <h2>Begrippen</h2>
      <table>
        <tr><th style="width:200px;">Term</th><th>Uitleg</th></tr>
        <tr><td><strong>FGA</strong></td><td>Functionele Groep Aanwijzing. Basisgroep die bepaalt welk type medewerker je bent (bijv. "Medewerker", "Medisch Specialist", "Externe medewerker").</td></tr>
        <tr><td><strong>afdl-</strong></td><td>Afdelingsgroep. Geeft toegang tot afdelingsspecifieke resources (mappen, applicaties, mailboxen).</td></tr>
        <tr><td><strong>affu-</strong></td><td>Afdeling/functiegroep. Combineert afdeling en functie voor fijnmazige toegang.</td></tr>
        <tr><td><strong>appl-</strong></td><td>Applicatiegroep. Geeft toegang tot een specifieke applicatie.</td></tr>
        <tr><td><strong>drvm-</strong></td><td>Drive mapping. Koppelt een netwerkschijf (bijv. L:, T:).</td></tr>
        <tr><td><strong>ntfs-</strong></td><td>NTFS-rechten. Geeft lees- of schrijfrechten op een map (bijv. ntfs-MICT-r = leesrechten op MICT-map).</td></tr>
        <tr><td><strong>mail-</strong></td><td>Mailgroep. Gedeelde mailbox of distributielijst.</td></tr>
        <tr><td><strong>plus-</strong></td><td>Uitzonderingsgroep. Voor rechten die niet via FGA/afdl/affu passen (bijv. beperkte licenties).</td></tr>
        <tr><td><strong>ctxr-</strong></td><td>Citrix-groep. Toegang tot virtuele desktops.</td></tr>
        <tr><td><strong>RBAC</strong></td><td>Role-Based Access Control. Autorisatiemodel waarbij rechten via rollen worden toegekend in plaats van direct per gebruiker.</td></tr>
        <tr><td><strong>AGDLP</strong></td><td>Account - Global - Domain Local - Permission. Microsoft best practice voor groepsstructuur.</td></tr>
        <tr><td><strong>Nesting</strong></td><td>Groep-in-groep lidmaatschap. Bijv. affu-MICT nest in appl-Chipsoft, waardoor alle MICT-medewerkers toegang krijgen.</td></tr>
        <tr><td><strong>Entra ID</strong></td><td>Voorheen Azure AD. Microsoft's cloud identity platform. Vereist platte groepsstructuur (max 1 niveau nesting).</td></tr>
        <tr><td><strong>NEN7510</strong></td><td>Nederlandse norm voor informatiebeveiliging in de zorg. Stelt eisen aan toegangsbeheer (A.9).</td></tr>
      </table>
    </div>

    <!-- TAB: Groepsontwerp -->
    <div id="tab-groepsontwerp" class="conf-tab-content">
      <h2>Hoe het groepsontwerp werkt</h2>
      <p style="color:#858585;margin-bottom:16px;">Het groepsontwerp definieert de regels voor hoe groepen aan elkaar gekoppeld mogen worden.</p>

      <div class="help-card">
        <h3 style="color:#4fc1ff;">Containergroepen</h3>
        <p style="color:#858585;font-size:13px;">Dit zijn de groepen waar een gebruiker direct lid van is. Ze bepalen de "identiteit" van de gebruiker.</p>
        <table style="margin-top:8px;">
          <tr><th>Type</th><th>Doel</th><th>Voorbeeld</th></tr>
          <tr><td>FGA</td><td>Organisatiebrede rol</td><td>FGA - Medewerker, FGA - Medisch Specialist</td></tr>
          <tr><td>afdl-</td><td>Afdelingstoegang</td><td>afdl-MICT, afdl-ZE_SEH</td></tr>
          <tr><td>affu-</td><td>Functie op afdeling</td><td>affu-MICT-AUT-SNB (Automatisering, Sr. Netwerkbeheerder)</td></tr>
          <tr><td>plus-</td><td>Uitzonderingen</td><td>plus-Visio (licentie), plus-TestDesktop</td></tr>
          <tr><td>ctxr-</td><td>Virtual desktop</td><td>ctxr-desktop-bravis-m365apps</td></tr>
        </table>
      </div>

      <div class="help-card">
        <h3 style="color:#ce9178;">Resourcegroepen</h3>
        <p style="color:#858585;font-size:13px;">Dit zijn de groepen die daadwerkelijk rechten verlenen. Gebruikers mogen hier NIET direct lid van zijn.</p>
        <table style="margin-top:8px;">
          <tr><th>Type</th><th>Doel</th><th>Voorbeeld</th></tr>
          <tr><td>appl-</td><td>Applicatietoegang</td><td>appl-Chipsoft_HIX-productie</td></tr>
          <tr><td>ntfs-</td><td>Bestandsrechten</td><td>ntfs-MICT-r (lezen), ntfs-MICT_Arch-rw (lezen+schrijven)</td></tr>
          <tr><td>drvm-</td><td>Schijfkoppeling</td><td>drvm-L_groups, drvm-T_automatisering</td></tr>
          <tr><td>mail-</td><td>Mailboxtoegang</td><td>mail-Informatiebeveiliging</td></tr>
        </table>
      </div>

      <div class="help-card">
        <h3>Nestingregels</h3>
        <p style="color:#858585;font-size:13px;">Container-groepen nesten in resource-groepen. Nooit andersom. Nooit hetzelfde type in hetzelfde type.</p>
        <div class="code-block" style="margin-top:8px;">
          <code>Gebruiker ── FGA ──── appl- ── ntfs-/drvm-
           ├── afdl- ── appl-/ntfs-/mail-
           ├── affu- ── appl-/ntfs-/drvm-/mail-
           ├── plus- ── appl-/ntfs-/drvm-
           └── ctxr-</code>
        </div>
      </div>

      <p style="margin-top:16px;">Je kunt het groepsontwerp aanpassen via <a href="/config">Groepsontwerp</a>. Wijzigingen worden opgeslagen in <code>data/design-config.json</code>.</p>
    </div>

    <!-- TAB: Privacy -->
    <div id="tab-privacy" class="conf-tab-content">
      <h2>Privacy & beveiliging</h2>

      <div class="help-card">
        <h3 style="color:#89d185;">Gegevensverwerking</h3>
        <ul style="font-size:13px; line-height:2; padding-left:20px;">
          <li><strong>Alle data blijft lokaal.</strong> Er wordt niets naar externe servers gestuurd, tenzij je zelf een LLM API-sleutel configureert voor persona-classificatie.</li>
          <li><strong>De database</strong> bevat AD-metadata: accountnamen, functietitels, afdelingen, groepsnamen en lidmaatschappen. Geen wachtwoorden, geen bestandsinhoud.</li>
          <li><strong>Bij LLM-gebruik</strong> worden alleen functietitels en persona-definities verstuurd. Geen accountnamen, e-mailadressen of andere persoonsgegevens.</li>
          <li><strong>De API-sleutel</strong> wordt niet opgeslagen. Deze blijft alleen in het browsergeheugen tijdens de sessie.</li>
        </ul>
      </div>

      <div class="help-card">
        <h3 style="color:#cca700;">Welke gegevens staan in de database?</h3>
        <table style="margin-top:8px;">
          <tr><th>Gegeven</th><th>Voorbeeld</th><th>Classificatie</th></tr>
          <tr><td>SAM-accountnaam</td><td>jjansen</td><td>Indirect identificerend</td></tr>
          <tr><td>Weergavenaam</td><td>Jan Jansen</td><td>Direct identificerend</td></tr>
          <tr><td>E-mailadres</td><td>j.jansen@org.nl</td><td>Direct identificerend</td></tr>
          <tr><td>Afdeling</td><td>Cardiologie</td><td>Niet-identificerend</td></tr>
          <tr><td>Functietitel</td><td>Verpleegkundige</td><td>Niet-identificerend</td></tr>
          <tr><td>Groepsnamen</td><td>appl-HiX-productie</td><td>Niet-identificerend</td></tr>
          <tr><td>Laatste login</td><td>2026-03-16</td><td>Indirect identificerend</td></tr>
        </table>
      </div>

      <div class="help-card">
        <h3 style="color:#f44747;">Aanbevelingen</h3>
        <ul style="font-size:13px; line-height:2; padding-left:20px;">
          <li>Bewaar de database (<code>ad-analysis.db</code>) op een versleuteld opslagmedium.</li>
          <li>Deel het DOCX-rapport alleen met geautoriseerde personen (classificatie: Vertrouwelijk).</li>
          <li>Verwijder de database na afronding van het project.</li>
          <li>De PowerShell-export vereist AD-leesrechten. Gebruik een account met minimale privileges.</li>
          <li>Draai de applicatie niet op een gedeeld werkstation zonder schermvergrendeling.</li>
        </ul>
      </div>
    </div>

    <!-- TAB: FAQ -->
    <div id="tab-faq" class="conf-tab-content">
      <h2>Veelgestelde vragen</h2>

      <div class="help-card">
        <h3>De applicatie is traag bij het eerste laden</h3>
        <p style="color:#858585;font-size:13px;">De database wordt bij de eerste request volledig in geheugen geladen. Bij een grote organisatie (>5.000 users) kan dit enkele seconden duren. Daarna zijn alle pagina's instant.</p>
      </div>

      <div class="help-card">
        <h3>Ik krijg een fout bij de PowerShell-export</h3>
        <p style="color:#858585;font-size:13px;">Zorg dat de ActiveDirectory PowerShell-module is geinstalleerd (RSAT). De scripts moeten draaien op een werkstation dat toegang heeft tot de domeincontroller. Gebruik <code>MaxResults: 100</code> om eerst te testen.</p>
      </div>

      <div class="help-card">
        <h3>Kan ik de tool gebruiken voor een andere organisatie?</h3>
        <p style="color:#858585;font-size:13px;">Ja. Ga naar <a href="/config">Groepsontwerp</a> om het prefix-schema aan te passen. Ga naar <a href="/personas">Persona's</a> om de persona-definities en titel-mapping te wijzigen. De analyse past zich automatisch aan.</p>
      </div>

      <div class="help-card">
        <h3>Wat wordt er naar de LLM gestuurd bij persona-classificatie?</h3>
        <p style="color:#858585;font-size:13px;">Alleen de lijst met unieke functietitels en de persona-definities. Geen namen, e-mailadressen, accountnamen of andere persoonsgegevens. De API-sleutel wordt niet opgeslagen.</p>
      </div>

      <div class="help-card">
        <h3>Hoe distribueer ik de portable versie?</h3>
        <p style="color:#858585;font-size:13px;">Kopieer <code>adcleaner.exe</code> + de <code>data/</code> map + de <code>scripts/</code> map naar een USB-stick of netwerklocatie. Dubbelklik op de exe om te starten. Geen installatie nodig.</p>
      </div>

      <div class="help-card">
        <h3>Hoe verwijder ik alle data?</h3>
        <p style="color:#858585;font-size:13px;">Ga naar <a href="/import">Import</a> en klik op "Database legen". Of verwijder het bestand <code>data/ad-analysis.db</code> handmatig.</p>
      </div>
    </div>

    <script>
      function showTab(tabId) {
        document.querySelectorAll('.conf-tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.conf-tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById('tab-' + tabId).style.display = 'block';
        document.querySelector('[data-tab="' + tabId + '"]').classList.add('active');
      }
    </script>`;

  return renderLayout('Hulp', body, 'help');
}

module.exports = { render };
