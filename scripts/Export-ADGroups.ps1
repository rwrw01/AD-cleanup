<#
.SYNOPSIS
    Export Active Directory groups to CSV for AD Opschonen analysis.
.PARAMETER MaxResults
    Maximum number of groups to export. Default: unlimited.
.PARAMETER OutputPath
    Directory for CSV output. Default: current directory.
.PARAMETER SearchBase
    AD search base (OU). Default: entire domain.
#>
[CmdletBinding()]
param(
    [int]$MaxResults = 0,
    [string]$OutputPath = ".",
    [string]$SearchBase = ""
)

Import-Module ActiveDirectory -ErrorAction Stop

$properties = @(
    'Name', 'SamAccountName', 'GroupCategory', 'GroupScope',
    'Description', 'DistinguishedName', 'ManagedBy',
    'WhenCreated', 'WhenChanged', 'Members'
)

$params = @{
    Filter     = '*'
    Properties = $properties
}

if ($SearchBase) { $params['SearchBase'] = $SearchBase }
if ($MaxResults -gt 0) { $params['ResultSetSize'] = $MaxResults }

Write-Host "Exporting AD groups..." -ForegroundColor Cyan

$groups = Get-ADGroup @params | Select-Object @(
    'Name'
    'SamAccountName'
    @{N='GroupCategory'; E={ $_.GroupCategory.ToString() }}
    @{N='GroupScope'; E={ $_.GroupScope.ToString() }}
    'Description'
    'DistinguishedName'
    @{N='ManagedBy'; E={
        if ($_.ManagedBy) {
            try { (Get-ADUser $_.ManagedBy).SamAccountName } catch { $_.ManagedBy }
        } else { '' }
    }}
    @{N='MemberCount'; E={ $_.Members.Count }}
    @{N='WhenCreated'; E={ $_.WhenCreated.ToString('yyyy-MM-dd HH:mm:ss') }}
    @{N='WhenChanged'; E={ $_.WhenChanged.ToString('yyyy-MM-dd HH:mm:ss') }}
)

$outFile = Join-Path $OutputPath "groups.csv"
$groups | Export-Csv -Path $outFile -NoTypeInformation -Encoding UTF8

Write-Host "Exported $($groups.Count) groups to $outFile" -ForegroundColor Green
