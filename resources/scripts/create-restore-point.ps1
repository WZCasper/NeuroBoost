<#
  create-restore-point.ps1
  Best-effort System Restore checkpoint before a risky change (debloat,
  telemetry changes). Windows itself throttles MODIFY_SETTINGS restore
  points to one per 24 hours by default, so this commonly no-ops on a
  machine that already made one today - that is expected, not an error
  in this script.
#>
[CmdletBinding()]
param(
  [string]$Description = 'NeuroBoost'
)

$ErrorActionPreference = 'Stop'

# Report a structured result instead of just succeed/fail, so the UI can
# tell the user the difference between "protected" and "System Protection
# is switched off on this machine" - silently claiming a safety net that
# does not exist would be worse than having none.
function Test-SystemRestoreEnabled {
  try {
    $rp = Get-CimInstance -Namespace 'root/default' -ClassName SystemRestoreConfig -ErrorAction SilentlyContinue
    if ($rp) { return $true }
  } catch { }
  try {
    $val = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' -Name 'RPSessionInterval' -ErrorAction SilentlyContinue
    if ($val -and $val.RPSessionInterval -gt 0) { return $true }
  } catch { }
  return $false
}

$wasEnabled = Test-SystemRestoreEnabled

try {
  if (-not $wasEnabled) {
    Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction Stop
  }
  Checkpoint-Computer -Description $Description -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
  [pscustomobject]@{ created = $true; reason = 'created' } | ConvertTo-Json -Compress
  exit 0
}
catch {
  $msg = $_.Exception.Message
  # Windows throttles MODIFY_SETTINGS checkpoints to one per 24h by default;
  # that is not a failure of this tool and an existing recent point still
  # protects the user, so it is reported distinctly.
  $reason = if ($msg -match '1440|frequency|too frequent') { 'throttled' }
            elseif (-not $wasEnabled) { 'disabled' }
            else { 'error' }
  [pscustomobject]@{ created = $false; reason = $reason; message = $msg } | ConvertTo-Json -Compress
  exit 0
}
