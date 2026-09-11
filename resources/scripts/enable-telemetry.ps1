<#
  enable-telemetry.ps1
  Restores every value recorded by disable-telemetry.ps1 to its exact prior
  state: re-applies the original registry value (or removes the key if it
  didn't exist before), and restores service start types.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFilePath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $BackupFilePath)) {
  Write-Error "Backup file not found: $BackupFilePath"
  exit 1
}

function Restore-RegValue {
  param([string]$Path, [string]$Name, [bool]$Existed, $Value)
  if (-not $Existed) {
    if (Test-Path $Path) {
      Remove-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue
    }
    return
  }
  if (-not (Test-Path $Path)) {
    New-Item -Path $Path -Force | Out-Null
  }
  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType DWord -Force | Out-Null
}

$raw = Get-Content -Path $BackupFilePath -Raw
$entries = $raw | ConvertFrom-Json

foreach ($entry in $entries) {
  if ($entry.path -like 'service:*') {
    $svcName = $entry.path.Substring(8)
    $mode = $entry.value
    if ($mode -and (Get-Service -Name $svcName -ErrorAction SilentlyContinue)) {
      $type = switch ($mode) {
        'Auto' { 'Automatic' }
        'Manual' { 'Manual' }
        'Disabled' { 'Disabled' }
        default { 'Manual' }
      }
      Set-Service -Name $svcName -StartupType $type -ErrorAction SilentlyContinue
      if ($type -ne 'Disabled') {
        Start-Service -Name $svcName -ErrorAction SilentlyContinue
      }
    }
    continue
  }

  Restore-RegValue -Path $entry.path -Name $entry.name -Existed ([bool]$entry.existed) -Value $entry.value
}

Write-Output 'OK'
