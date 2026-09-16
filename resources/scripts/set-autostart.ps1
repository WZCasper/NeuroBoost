<#
  set-autostart.ps1
  Enables/disables launching NeuroBoost at logon.

  Uses a Scheduled Task with RunLevel Highest rather than the usual
  HKCU\...\Run registry value. NeuroBoost is installed per-machine and its
  manifest demands administrator rights, and Windows deliberately refuses
  to auto-start an elevation-requiring program from a Run key - it is
  either silently skipped or blocked behind a UAC prompt at logon. A
  scheduled task registered with the highest run level is the supported way
  to do this, and it starts without a UAC prompt.

  -Action status returns JSON so the UI can show the true current state
  instead of assuming the last write succeeded.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('enable', 'disable', 'status')]
  [string]$Action,

  [string]$ExePath
)

$ErrorActionPreference = 'Stop'
$taskName = 'NeuroBoostAutoStart'

function Get-TaskState {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) { return $false }
  return ($task.State -ne 'Disabled')
}

try {
  switch ($Action) {
    'status' {
      [pscustomobject]@{ enabled = (Get-TaskState) } | ConvertTo-Json -Compress
      exit 0
    }

    'enable' {
      if (-not $ExePath) { throw 'ExePath is required to enable autostart.' }
      if (-not (Test-Path $ExePath)) { throw "Executable not found: $ExePath" }

      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

      # --start-minimized is read by main.js so an auto-start lands in the
      # tray instead of popping a window in the user's face at every logon.
      $action = New-ScheduledTaskAction -Execute $ExePath -Argument '--start-minimized'
      $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
      $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

      Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Launches NeuroBoost at logon with administrator rights.' -Force | Out-Null

      [pscustomobject]@{ enabled = $true } | ConvertTo-Json -Compress
      exit 0
    }

    'disable' {
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
      [pscustomobject]@{ enabled = $false } | ConvertTo-Json -Compress
      exit 0
    }
  }
}
catch {
  Write-Error "Autostart $Action failed: $($_.Exception.Message)"
  exit 1
}
