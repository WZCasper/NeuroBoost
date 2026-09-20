<#
  toggle-startup.ps1
  Enables or disables one startup entry.

  Run-key entries: writes the same StartupApproved binary flag Task
  Manager's Startup tab uses (byte 0: 0x02 = enabled, 0x03 = disabled),
  preserving any other bytes already present. The Run value itself is
  never deleted, so this is fully reversible from either NeuroBoost or
  Task Manager.

  Startup-folder shortcuts: moved into (disable) or out of (enable) a
  _NeuroBoost_Disabled subfolder next to the real Startup folder. A
  no-op (still reports success) if the shortcut is already in the
  requested state.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Id,

  [Parameter(Mandatory = $true)]
  [ValidateSet('enable', 'disable')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\startup-safety.ps1')

$parts = $Id.Split('|', 3)
$type = $parts[0]

try {
  if ($type -eq 'run') {
    $scope = $parts[1]
    $name = $parts[2]

    $approvedKey = switch ($scope) {
      'user' { 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' }
      'machine' { 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' }
      'machine32' { 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32' }
      default { throw "Unknown startup scope: $scope" }
    }

    if (-not (Test-Path $approvedKey)) {
      New-Item -Path $approvedKey -Force | Out-Null
    }

    $flag = if ($Action -eq 'enable') { [byte]2 } else { [byte]3 }
    $existing = Get-ItemProperty -Path $approvedKey -Name $name -ErrorAction SilentlyContinue
    if ($existing -and $existing.$name -and $existing.$name.Length -ge 12) {
      $bytes = [byte[]]$existing.$name.Clone()
    }
    else {
      $bytes = New-Object byte[] 12
    }
    $bytes[0] = $flag

    New-ItemProperty -Path $approvedKey -Name $name -Value $bytes -PropertyType Binary -Force | Out-Null
    Write-Output 'OK'
    exit 0
  }
  elseif ($type -eq 'folder') {
    $filePath = $parts[2]
    if (-not $filePath -or -not (Test-Path -LiteralPath $filePath)) {
      Write-Error "Shortcut not found: $filePath"
      exit 1
    }

    # The Id comes from the UI and this script runs as Administrator, so the
    # path is validated by the shared rule in lib/startup-safety.ps1.
    $filePath = Resolve-StartupShortcut -Path $filePath

    $dir = Split-Path $filePath -Parent
    $fileName = Split-Path $filePath -Leaf
    $isCurrentlyDisabled = (Split-Path $dir -Leaf) -eq '_NeuroBoost_Disabled'

    if ($Action -eq 'disable' -and -not $isCurrentlyDisabled) {
      $disabledDir = Join-Path $dir '_NeuroBoost_Disabled'
      if (-not (Test-Path $disabledDir)) {
        New-Item -ItemType Directory -Path $disabledDir -Force | Out-Null
      }
      Move-Item -LiteralPath $filePath -Destination (Join-Path $disabledDir $fileName) -Force
    }
    elseif ($Action -eq 'enable' -and $isCurrentlyDisabled) {
      $targetDir = Split-Path $dir -Parent
      Move-Item -LiteralPath $filePath -Destination (Join-Path $targetDir $fileName) -Force
    }

    Write-Output 'OK'
    exit 0
  }
  else {
    Write-Error "Unknown startup item type: $type"
    exit 1
  }
}
catch {
  Write-Error "Failed to toggle startup item: $($_.Exception.Message)"
  exit 1
}
