<#
.SYNOPSIS
    Export all group memberships to CSV for AD Opschonen analysis.
.DESCRIPTION
    Exports direct memberships (user→group and group→group) which are
    needed to calculate nesting depth and effective permissions.
    Uses the Members property instead of Get-ADGroupMember to handle
    large groups (Domain Users, Domain Computers) without size limit errors.
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

$memberships = [System.Collections.Generic.List[PSCustomObject]]::new()
$groupCount = 0
$skippedMembers = 0

Get-ADGroup @params | ForEach-Object {
    $groupName = $_.SamAccountName
    $groupDN = $_.DistinguishedName
    $groupCount++

    if ($groupCount % 50 -eq 0) {
        Write-Host "  Processing group $groupCount..." -ForegroundColor DarkCyan
    }

    foreach ($memberDN in $_.Members) {
        try {
            $member = Get-ADObject -Identity $memberDN -Properties SamAccountName -ErrorAction Stop
            $memberships.Add([PSCustomObject]@{
                GroupName  = $groupName
                GroupDN    = $groupDN
                MemberName = $member.SamAccountName
                MemberDN   = $member.DistinguishedName
                MemberType = $member.objectClass  # user, group, or computer
            })
        } catch {
            $skippedMembers++
            Write-Verbose "Could not resolve member $memberDN in $groupName : $_"
        }
    }
}

$outFile = Join-Path $OutputPath "memberships.csv"
$memberships | Export-Csv -Path $outFile -NoTypeInformation -Encoding UTF8

Write-Host "Exported $($memberships.Count) memberships from $groupCount groups to $outFile" -ForegroundColor Green
if ($skippedMembers -gt 0) {
    Write-Host "  Skipped $skippedMembers unresolvable members (deleted objects, foreign principals)" -ForegroundColor Yellow
}
