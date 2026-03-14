<#
.SYNOPSIS
    Export all group memberships to CSV for AD Opschonen analysis.
.DESCRIPTION
    Exports direct memberships (user→group and group→group) which are
    needed to calculate nesting depth and effective permissions.
.PARAMETER MaxResults
    Maximum number of groups to process. Default: unlimited.
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

$params = @{ Filter = '*'; Properties = @('Members') }
if ($SearchBase) { $params['SearchBase'] = $SearchBase }
if ($MaxResults -gt 0) { $params['ResultSetSize'] = $MaxResults }

Write-Host "Exporting AD memberships..." -ForegroundColor Cyan

$memberships = @()
$groupCount = 0

Get-ADGroup @params | ForEach-Object {
    $groupName = $_.SamAccountName
    $groupDN = $_.DistinguishedName
    $groupCount++

    if ($groupCount % 50 -eq 0) {
        Write-Host "  Processing group $groupCount..." -ForegroundColor DarkCyan
    }

    try {
        Get-ADGroupMember -Identity $_.DistinguishedName -ErrorAction SilentlyContinue | ForEach-Object {
            $memberships += [PSCustomObject]@{
                GroupName  = $groupName
                GroupDN    = $groupDN
                MemberName = $_.SamAccountName
                MemberDN   = $_.DistinguishedName
                MemberType = $_.objectClass  # user, group, or computer
            }
        }
    } catch {
        Write-Warning "Could not enumerate members of $groupName : $_"
    }
}

$outFile = Join-Path $OutputPath "memberships.csv"
$memberships | Export-Csv -Path $outFile -NoTypeInformation -Encoding UTF8

Write-Host "Exported $($memberships.Count) memberships from $groupCount groups to $outFile" -ForegroundColor Green
