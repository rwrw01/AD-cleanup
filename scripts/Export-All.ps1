<#
.SYNOPSIS
    Run all AD export scripts and package output for AD Opschonen.
.PARAMETER MaxResults
    Maximum objects per export type. Default: unlimited.
.PARAMETER OutputPath
    Output directory. Default: AD-Export-<timestamp> in current dir.
.PARAMETER SearchBase
    AD search base (OU). Default: entire domain.
.PARAMETER Zip
    Create a ZIP archive of the output. Default: false.
.EXAMPLE
    .\Export-All.ps1 -MaxResults 100
    .\Export-All.ps1 -MaxResults 500 -Zip -OutputPath C:\Exports
#>
[CmdletBinding()]
param(
    [int]$MaxResults = 0,
    [string]$OutputPath = "",
    [string]$SearchBase = "",
    [switch]$Zip
)

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $OutputPath) {
    $OutputPath = Join-Path (Get-Location) "AD-Export-$timestamp"
}

if (-not (Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
}

Write-Host ""
Write-Host "=== AD Opschonen - Volledige Export ===" -ForegroundColor White
Write-Host "Output: $OutputPath" -ForegroundColor DarkGray
if ($MaxResults -gt 0) {
    Write-Host "Beperkt tot: $MaxResults objecten per type" -ForegroundColor Yellow
}
Write-Host ""

$scriptDir = $PSScriptRoot
$commonParams = @{ OutputPath = $OutputPath }
if ($MaxResults -gt 0) { $commonParams['MaxResults'] = $MaxResults }
if ($SearchBase) { $commonParams['SearchBase'] = $SearchBase }

$scripts = @(
    @{ Name = 'Users';            Script = 'Export-ADUsers.ps1' }
    @{ Name = 'Groups';           Script = 'Export-ADGroups.ps1' }
    @{ Name = 'Memberships';      Script = 'Export-ADMemberships.ps1' }
    @{ Name = 'OU Structure';     Script = 'Export-ADOUStructure.ps1' }
    @{ Name = 'Service Accounts'; Script = 'Export-ADServiceAccounts.ps1' }
)

foreach ($s in $scripts) {
    Write-Host ""
    Write-Host "--- $($s.Name) ---" -ForegroundColor White
    $scriptPath = Join-Path $scriptDir $s.Script

    # OU Structure script does not accept MaxResults or SearchBase
    if ($s.Script -eq 'Export-ADOUStructure.ps1') {
        & $scriptPath -OutputPath $OutputPath
    } else {
        & $scriptPath @commonParams
    }
}

if ($Zip) {
    $zipFile = "$OutputPath.zip"
    Write-Host ""
    Write-Host "Creating ZIP archive: $zipFile" -ForegroundColor Cyan
    Compress-Archive -Path $OutputPath -DestinationPath $zipFile -Force
    Write-Host "Archive created: $zipFile" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Export compleet ===" -ForegroundColor Green
Write-Host "Kopieer de bestanden uit $OutputPath naar projects/ad-opschonen/data/imports/" -ForegroundColor Yellow
Write-Host "Draai vervolgens: npm run import" -ForegroundColor Yellow
