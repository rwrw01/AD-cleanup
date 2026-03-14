<#
.SYNOPSIS
    Export service accounts (users with SPNs) to CSV for AD Opschonen analysis.
.PARAMETER MaxResults
    Maximum number of results. Default: unlimited.
.PARAMETER OutputPath
    Directory for CSV output. Default: current directory.
#>
[CmdletBinding()]
param(
    [int]$MaxResults = 0,
    [string]$OutputPath = "."
)

Import-Module ActiveDirectory -ErrorAction Stop

Write-Host "Exporting service accounts..." -ForegroundColor Cyan

$params = @{
    Filter     = 'ServicePrincipalName -like "*"'
    Properties = @('SamAccountName', 'ServicePrincipalName', 'PasswordLastSet',
                   'LastLogonDate', 'Enabled', 'Description', 'WhenCreated')
}

if ($MaxResults -gt 0) { $params['ResultSetSize'] = $MaxResults }

$accounts = Get-ADUser @params | Select-Object @(
    'SamAccountName'
    @{N='ServicePrincipalNames'; E={ ($_.ServicePrincipalName -join '; ') }}
    @{N='PasswordLastSet'; E={ if ($_.PasswordLastSet) { $_.PasswordLastSet.ToString('yyyy-MM-dd HH:mm:ss') } else { '' } }}
    @{N='LastLogonDate'; E={ if ($_.LastLogonDate) { $_.LastLogonDate.ToString('yyyy-MM-dd HH:mm:ss') } else { '' } }}
    'Enabled'
    'Description'
    @{N='WhenCreated'; E={ $_.WhenCreated.ToString('yyyy-MM-dd HH:mm:ss') }}
)

$outFile = Join-Path $OutputPath "service-accounts.csv"
$accounts | Export-Csv -Path $outFile -NoTypeInformation -Encoding UTF8

Write-Host "Exported $($accounts.Count) service accounts to $outFile" -ForegroundColor Green
