<#
  set-priority.ps1
  Sets a process's CPU priority class. RealTime is intentionally not an
  allowed value (ValidateSet below) — it can starve input/audio drivers and
  hang the system, which has no place in a "safe" optimizer.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [int]$ProcessId,

  [Parameter(Mandatory = $true)]
  [ValidateSet('Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High')]
  [string]$Priority
)

$ErrorActionPreference = 'Stop'

try {
  $proc = Get-Process -Id $ProcessId -ErrorAction Stop
  $proc.PriorityClass = [System.Diagnostics.ProcessPriorityClass]$Priority
  Write-Output 'OK'
  exit 0
}
catch {
  Write-Error "Failed to set priority for PID $ProcessId : $($_.Exception.Message)"
  exit 1
}
