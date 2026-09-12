<#
  disable-telemetry.ps1
  Reduces Windows diagnostic data collection and optionally turns off
  Cortana / Widgets / Copilot / Advertising ID.

  Each change is applied independently inside its own try/catch: if one key
  is blocked (e.g. by a security policy or a Windows build that has locked
  it down), the rest still apply instead of the whole run failing. Output is
  a JSON object: { backup: [...only the changes that actually succeeded...],
  results: [...per-item outcome, for user-facing feedback...] }. Only
  `backup` is used by enable-telemetry.ps1 to restore exact prior state.

  Deliberately NOT touched: Windows Update, Windows Defender/Security, and
  the firewall — this script only reduces telemetry, it does not weaken
  security.
#>
[CmdletBinding()]
param(
  [switch]$DisableWidgets,
  [switch]$DisableCopilot,
  [switch]$DisableCortana,
  [switch]$DisableAdvertisingId
)

$ErrorActionPreference = 'Stop'

function Get-RegState {
  param([string]$Path, [string]$Name)
  $existed = $false
  $value = $null
  if (Test-Path $Path) {
    $item = Get-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue
    if ($null -ne $item -and ($item.PSObject.Properties.Name -contains $Name)) {
      $existed = $true
      $value = $item.$Name
    }
  }
  [pscustomobject]@{ path = $Path; name = $Name; existed = $existed; value = $value }
}

function Set-RegValue {
  param([string]$Path, [string]$Name, $Value, [string]$Type = 'DWord')
  if (-not (Test-Path $Path)) {
    New-Item -Path $Path -Force | Out-Null
  }
  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
}

$backup = New-Object System.Collections.Generic.List[object]
$results = New-Object System.Collections.Generic.List[object]

function Apply-RegChange {
  param([string]$Label, [string]$Path, [string]$Name, $NewValue)
  try {
    $prev = Get-RegState $Path $Name
    Set-RegValue $Path $Name $NewValue
    $backup.Add($prev)
    $results.Add([pscustomobject]@{ label = $Label; status = 'changed' })
  }
  catch {
    $results.Add([pscustomobject]@{ label = $Label; status = 'failed'; error = $_.Exception.Message })
  }
}

# 1. Core diagnostic data level (0 = Security/minimum; Home/Pro treat this the
#    same as Basic since only Enterprise/Education fully honor "Security").
Apply-RegChange -Label 'Диагностические данные' `
  -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' -Name 'AllowTelemetry' -NewValue 0

# 2. Advertising ID
if ($DisableAdvertisingId) {
  Apply-RegChange -Label 'Рекламный идентификатор' `
    -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo' -Name 'Enabled' -NewValue 0
}

# 3. Cortana (Windows 10)
if ($DisableCortana) {
  Apply-RegChange -Label 'Кортана' `
    -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' -Name 'AllowCortana' -NewValue 0
}

# 4. Widgets icon on the taskbar (Windows 11)
if ($DisableWidgets) {
  Apply-RegChange -Label 'Виджеты' `
    -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced' -Name 'TaskbarDa' -NewValue 0
}

# 5. Copilot (Windows 11, 23H2+)
if ($DisableCopilot) {
  Apply-RegChange -Label 'Copilot' `
    -Path 'HKCU:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot' -Name 'TurnOffWindowsCopilot' -NewValue 1
}

# 6. Telemetry services
foreach ($svcName in @('DiagTrack', 'dmwappushservice')) {
  try {
    $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
    if ($svc) {
      $cim = Get-CimInstance -ClassName Win32_Service -Filter "Name='$svcName'" -ErrorAction SilentlyContinue
      $startType = if ($cim) { $cim.StartMode } else { 'Unknown' }
      Stop-Service -Name $svcName -Force -ErrorAction Stop
      Set-Service -Name $svcName -StartupType Disabled -ErrorAction Stop
      $backup.Add([pscustomobject]@{ path = "service:$svcName"; name = 'StartMode'; existed = $true; value = $startType })
      $results.Add([pscustomobject]@{ label = "Служба $svcName"; status = 'changed' })
    }
  }
  catch {
    $results.Add([pscustomobject]@{ label = "Служба $svcName"; status = 'failed'; error = $_.Exception.Message })
  }
}

$output = [pscustomobject]@{
  backup  = $backup
  results = $results
}

ConvertTo-Json -InputObject $output -Compress -Depth 6
