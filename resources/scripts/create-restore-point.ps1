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

try {
  Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
  Checkpoint-Computer -Description $Description -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
  Write-Output 'OK'
  exit 0
}
catch {
  Write-Error "Restore point not created: $($_.Exception.Message)"
  exit 1
}
