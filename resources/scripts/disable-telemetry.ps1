<#
  disable-telemetry.ps1
  Reduces Windows diagnostic data collection and optionally turns off
  Cortana / Widgets / Copilot / Advertising ID. Before changing anything it
  records the previous value of every key/service it touches and prints that
  record as JSON, so enable-telemetry.ps1 can restore the exact prior state.

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

# 1. Core diagnostic data level (0 = Security/minimum; Home/Pro treat this the
#    same as Basic since only Enterprise/Education fully honor "Security").
$p1 = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection'
$backup.Add((Get-RegState $p1 'AllowTelemetry'))
Set-RegValue $p1 'AllowTelemetry' 0

# 2. Advertising ID
if ($DisableAdvertisingId) {
  $p2 = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo'
  $backup.Add((Get-RegState $p2 'Enabled'))
  Set-RegValue $p2 'Enabled' 0
}

# 3. Cortana (Windows 10)
if ($DisableCortana) {
  $p3 = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search'
  $backup.Add((Get-RegState $p3 'AllowCortana'))
  Set-RegValue $p3 'AllowCortana' 0
}

# 4. Widgets icon on the taskbar (Windows 11)
if ($DisableWidgets) {
  $p4 = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
  $backup.Add((Get-RegState $p4 'TaskbarDa'))
  Set-RegValue $p4 'TaskbarDa' 0
}

# 5. Copilot (Windows 11, 23H2+)
if ($DisableCopilot) {
  $p5 = 'HKCU:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot'
  $backup.Add((Get-RegState $p5 'TurnOffWindowsCopilot'))
  Set-RegValue $p5 'TurnOffWindowsCopilot' 1
}

# 6. Telemetry services
foreach ($svcName in @('DiagTrack', 'dmwappushservice')) {
  $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
  if ($svc) {
    $cim = Get-CimInstance -ClassName Win32_Service -Filter "Name='$svcName'" -ErrorAction SilentlyContinue
    $startType = if ($cim) { $cim.StartMode } else { 'Unknown' }
    $backup.Add([pscustomobject]@{ path = "service:$svcName"; name = 'StartMode'; existed = $true; value = $startType })
    Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
    Set-Service -Name $svcName -StartupType Disabled -ErrorAction SilentlyContinue
  }
}

# Pass via -InputObject (never pipe a single-item collection into
# ConvertTo-Json) so the result is always a JSON array, even with one entry.
ConvertTo-Json -InputObject $backup -Compress -Depth 5
