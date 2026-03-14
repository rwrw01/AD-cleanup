# AD Cleanup

Active Directory analyse- en opschoontool. Importeert AD-exports (CSV), detecteert problemen, genereert een RBAC-rollenvoorstel, simuleert de impact, en toetst Entra ID-gereedheid. Resultaten zijn zichtbaar in een webinterface.

## Screenshots

| Dashboard | Problemen |
|-----------|-----------|
| ![Dashboard](docs/screenshot-dashboard.png) | ![Problemen](docs/screenshot-problems.png) |

| Groepen | Gebruikers |
|---------|------------|
| ![Groepen](docs/screenshot-groups.png) | ![Gebruikers](docs/screenshot-users.png) |

| RBAC Voorstel | IST/SOLL Simulatie |
|---------------|-------------------|
| ![RBAC](docs/screenshot-rbac.png) | ![Simulator](docs/screenshot-simulator.png) |

| Entra ID Gereedheid | Import |
|---------------------|--------|
| ![Entra](docs/screenshot-entra.png) | ![Import](docs/screenshot-import.png) |

## Quick Start

```bash
npm install

# 1. Draai PowerShell scripts op een werkstation met RSAT
.\scripts\Export-All.ps1 -OutputPath C:\AD-Export

# 2. Kopieer CSV's naar data/imports/
#    (users.csv, groups.csv, memberships.csv, ous.csv, service-accounts.csv)

# 3. Importeer, analyseer en bekijk
npm run import
npm run analyze
npm run rbac
npm run simulate
npm run entra
npm run viewer        # http://localhost:3600
```

## Wat wordt geanalyseerd

### Probleemdetectie

| Categorie | Ernst | Controle |
|-----------|-------|----------|
| Circulaire nesting | CRITICAL | Groepen die via nesting naar zichzelf verwijzen |
| Diepe nesting (>3) | HIGH | Blokkeert Entra ID-synchronisatie |
| Lege groepen | MEDIUM | Ongebruikte groepen die de namespace vervuilen |
| Stale accounts | MEDIUM | Ingeschakeld maar >90 dagen geen login |
| Disabled in groepen | HIGH | Uitgeschakelde accounts met actief groepslidmaatschap |
| Wachtwoordbeleid | HIGH | "Nooit verlopen" of wachtwoord >365 dagen oud |
| Overbelaste accounts | HIGH | Gebruikers in >50 groepen (Kerberos-tokenlimiet) |
| Privileged access | CRITICAL | Directe en indirecte Domain/Enterprise Admin-rechten |
| Service accounts | HIGH | Oude wachtwoorden of ongebruikte SPN-accounts |
| Manager-hierarchie | MEDIUM | Ontbrekende manager-verwijzingen |

### RBAC-rollenvoorstel

Genereert een drielaags rollenmodel op basis van functie, afdeling en applicatiebundels:

| Laag | Prefix | Voorbeeld | Toelichting |
|------|--------|-----------|-------------|
| Basisrol | `ROL-` | `ROL-Verpleegkundige` | Gemeenschappelijke groepen voor iedereen met dezelfde functie |
| Afdelingsrol | `ROL-` | `ROL-Verpleegkundige-IC` | Extra groepen specifiek voor de afdeling |
| Applicatiebundel | `APP-BUNDEL-` | `APP-BUNDEL-Klinisch-Basis` | Set applicatiegroepen die samen worden toegekend |

Het algoritme clustert gebruikers op functietitel, berekent gemeenschappelijke groepen (Jaccard-similariteit), en wijst rollen toe met een vertrouwensscore. Applicatiegroepen die in >80% van de rollen samen voorkomen worden automatisch gebundeld — in plaats van 15 losse koppelingen krijgt een rol 1 bundel.

### AGDLP-structuur

Genereert een herstructureringsvoorstel conform Microsoft AGDLP best practice:

```
Accounts → Global Groups (GG-) → Domain Local Groups (DL-) → Permissions
```

- **GG- groepen**: rolgroepen die gebruikers bevatten (hernoemd van ROL-)
- **DL- groepen**: resourcegroepen die permissions krijgen
- **Nesting**: GG- nest in DL- (1 niveau, Entra ID-compatible)

Detecteert welke bestaande groepen al conform zijn en welke hernoemd moeten worden.

### IST/SOLL Simulatie

Vergelijkt de huidige groepstoewijzingen (IST) met het RBAC-voorstel inclusief bundels (SOLL) per gebruiker:

- **Toegevoegd** -- nieuwe groepen via de voorgestelde rol + bundel
- **Verwijderd** -- huidige toegang die vervalt (risico: toegangsverlies)
- **Behouden** -- ongewijzigde groepen

Gebruikers met toegangsverlies worden per afdeling gemarkeerd.

### Entra ID Gereedheid

Controleert of de AD-structuur gesynchroniseerd kan worden naar Microsoft Entra ID:

| Check | Blokkeerend |
|-------|-------------|
| Groepsnesting aanwezig | Ja |
| Ongeldige tekens in groepsnamen | Ja |
| Ontbrekende of dubbele UPN | Ja |
| Ontbrekende e-mailadressen | Nee (waarschuwing) |
| Groepen zonder eigenaar | Nee (waarschuwing) |

Resultaat: **GEREED**, **MOGELIJK** (met waarschuwingen), of **GEBLOKKEERD**.

Genereert daarnaast per rol:

- **Dynamic Group regels** -- Entra membership rules op basis van `user.jobTitle` en `user.department`, kopieerbaar naar Entra ID
- **Access Package voorstellen** -- bundel van groepen en applicaties per rol, met auto-assignment rule voor Entra ID Governance

## PowerShell Export Scripts

Draai op een werkstation met de AD-module (RSAT). Gebruik `-MaxResults 100` om eerst een subset te testen.

```powershell
# Alle exports in een keer
.\scripts\Export-All.ps1 -MaxResults 100 -OutputPath C:\AD-Export

# Parameters:
#   -MaxResults    Beperk aantal objecten per type (voor testen)
#   -OutputPath    Uitvoermap (standaard: AD-Export-<timestamp>)
#   -SearchBase    Filter op specifieke OU
#   -Zip           Maak een ZIP-archief na export

# Of per script apart
.\scripts\Export-ADUsers.ps1 -MaxResults 100
.\scripts\Export-ADGroups.ps1
.\scripts\Export-ADMemberships.ps1
.\scripts\Export-ADOUStructure.ps1
.\scripts\Export-ADServiceAccounts.ps1
```

### Geexporteerde gegevens

| Script | Bestand | Inhoud |
|--------|---------|--------|
| Export-ADUsers | users.csv | Account, naam, afdeling, functie, manager, status, wachtwoordbeleid, laatste login, UPN |
| Export-ADGroups | groups.csv | Naam, categorie, scope, eigenaar, aantal leden, aanmaakdatum |
| Export-ADMemberships | memberships.csv | Groep-lid relaties (gebruiker, groep, computer) |
| Export-ADOUStructure | ous.csv | OU-naam, pad, diepte |
| Export-ADServiceAccounts | service-accounts.csv | Account, SPN's, wachtwoordleeftijd, laatste login |

## Projectstructuur

```
scripts/                  PowerShell exports (on-premises)
src/
  database.js             SQLite schema (16 tabellen)
  importer.js             CSV-import naar database
  analyzer.js             Probleemdetectie (10 categorieen)
  rbac-engine.js          RBAC-rollen, applicatiebundels, AGDLP-voorstel
  simulator.js            IST/SOLL dry-run vergelijking (incl. bundels)
  entra-readiness.js      Entra ID check, Access Packages, dynamic groups
  report.js               CLI-rapport
  viewer.js               Webinterface op poort 3600
  views/                  Pagina-templates (dashboard, groepen, gebruikers, etc.)
docs/                     Screenshots
data/                     Lokale data (niet in git)
  imports/                CSV-bestanden
  ad-analysis.db          SQLite database
```

## npm Scripts

| Commando | Functie |
|----------|---------|
| `npm run import` | CSV-bestanden importeren naar SQLite |
| `npm run analyze` | Problemen detecteren |
| `npm run rbac` | RBAC-rollen, applicatiebundels en AGDLP-voorstel genereren |
| `npm run simulate` | IST/SOLL vergelijking uitvoeren (incl. bundels) |
| `npm run entra` | Entra ID gereedheid + Access Packages + dynamic group regels |
| `npm run report` | CLI-rapport genereren |
| `npm run viewer` | Webinterface starten op http://localhost:3600 |

## Dependencies

| Package | Functie |
|---------|---------|
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite database driver |
| [csv-parse](https://github.com/adaltas/node-csv) | CSV parser |

Vereist [Node.js](https://nodejs.org) en [PowerShell](https://github.com/PowerShell/PowerShell) met RSAT AD-module voor de exports.

## Licentie

[EUPL-1.2](LICENSE)
