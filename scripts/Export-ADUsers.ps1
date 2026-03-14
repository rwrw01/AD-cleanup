<#
.SYNOPSIS
    Export Active Directory users to CSV for AD Opschonen analysis.
.DESCRIPTION
    Exports user objects with attributes needed for RBAC analysis:
    identity, function, department, status, password policy, last logon.
.PARAMETER MaxResults
    Maximum number of users to export. Default: unlimited (all users).
.PARAMETER OutputPath
    Directory for CSV output. Default: current directory.
.PARAMETER SearchBase
    AD search base (OU). Default: entire domain.
.EXAMPLE
    .\Export-ADUsers.ps1 -MaxResults 100
    .\Export-ADUsers.ps1 -OutputPath C:\AD-Export -SearchBase "OU=Medewerkers,DC=hospital,DC=local"
#>
[CmdletBinding()]
param(
    [int]$MaxResults = 0,
    [string]$OutputPath = ".",
    [string]$SearchBase = ""
)

Import-Module ActiveDirectory -ErrorAction Stop

$properties = @(
    'SamAccountName', 'DisplayName', 'EmailAddress',
    'Department', 'Title', 'Manager',
    'Enabled', 'LastLogonDate', 'PasswordLastSet', 'PasswordNeverExpires',
    'DistinguishedName', 'EmployeeID', 'EmployeeNumber',
    'WhenCreated', 'WhenChanged', 'UserPrincipalName',
    'LockedOut', 'AccountExpirationDate', 'Description'
)

$params = @{
    Filter     = '*'
    Properties = $properties
}

if ($SearchBase) {
    $params['SearchBase'] = $SearchBase
}

if ($MaxResults -gt 0) {
    $params['ResultSetSize'] = $MaxResults
}

Write-Host "Exporting AD users..." -ForegroundColor Cyan

$users = Get-ADUser @params | Select-Object @(
    'SamAccountName'
    'DisplayName'
    'EmailAddress'
    'Department'
    'Title'
    @{N='ManagerSam'; E={
        if ($_.Manager) {
            try { (Get-ADUser $_.Manager).SamAccountName } catch { $_.Manager }
        } else { '' }
    }}
    'Enabled'
    @{N='LastLogonDate'; E={ if ($_.LastLogonDate) { $_.LastLogonDate.ToString('yyyy-MM-dd HH:mm:ss') } else { '' } }}
    @{N='PasswordLastSet'; E={ if ($_.PasswordLastSet) { $_.PasswordLastSet.ToString('yyyy-MM-dd HH:mm:ss') } else { '' } }}
    'PasswordNeverExpires'
    'DistinguishedName'
    'EmployeeID'
    @{N='EmployeeType'; E={ $_.EmployeeNumber }}
    @{N='WhenCreated'; E={ $_.WhenCreated.ToString('yyyy-MM-dd HH:mm:ss') }}
    'UserPrincipalName'
    'LockedOut'
    @{N='AccountExpirationDate'; E={ if ($_.AccountExpirationDate) { $_.AccountExpirationDate.ToString('yyyy-MM-dd') } else { '' } }}
    'Description'
)

$outFile = Join-Path $OutputPath "users.csv"
$users | Export-Csv -Path $outFile -NoTypeInformation -Encoding UTF8

Write-Host "Exported $($users.Count) users to $outFile" -ForegroundColor Green
