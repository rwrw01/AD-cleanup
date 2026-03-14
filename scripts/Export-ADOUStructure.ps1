<#
.SYNOPSIS
    Export Organizational Unit structure to CSV for AD Opschonen analysis.
.PARAMETER OutputPath
    Directory for CSV output. Default: current directory.
#>
[CmdletBinding()]
param(
    [string]$OutputPath = "."
)

Import-Module ActiveDirectory -ErrorAction Stop

Write-Host "Exporting OU structure..." -ForegroundColor Cyan

$ous = Get-ADOrganizationalUnit -Filter '*' -Properties Description, WhenCreated |
    Select-Object @(
        'Name'
        'DistinguishedName'
        'Description'
        @{N='Depth'; E={
            ($_.DistinguishedName -split '(?<!\\),OU=' | Measure-Object).Count - 1
        }}
        @{N='WhenCreated'; E={ $_.WhenCreated.ToString('yyyy-MM-dd HH:mm:ss') }}
    )

$outFile = Join-Path $OutputPath "ous.csv"
$ous | Export-Csv -Path $outFile -NoTypeInformation -Encoding UTF8

Write-Host "Exported $($ous.Count) OUs to $outFile" -ForegroundColor Green
