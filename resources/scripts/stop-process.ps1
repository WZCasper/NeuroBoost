<#
  stop-process.ps1
  Ends a process as gently as possible.

  Step 1: CloseMainWindow() - the same thing clicking the X button does, so
  the application gets to run its own "save your work?" logic. Anything with
  unsaved data gets a real chance to handle it.
  Step 2: only if it is still alive after a grace period, Stop-Process -Force.

  Reports which method actually ended it, so the UI can tell the user
  whether the app closed cleanly or had to be forced.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [int]$ProcessId,

  [int]$GraceMilliseconds = 3000
)

$ErrorActionPreference = 'Stop'

try {
  $proc = Get-Process -Id $ProcessId -ErrorAction Stop

  $closeRequested = $false
  try {
    if ($proc.MainWindowHandle -ne 0) {
      $closeRequested = $proc.CloseMainWindow()
    }
  }
  catch {
    $closeRequested = $false
  }

  if ($closeRequested) {
    $waited = 0
    $step = 200
    while ($waited -lt $GraceMilliseconds) {
      Start-Sleep -Milliseconds $step
      $waited += $step
      if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        [pscustomobject]@{ method = 'graceful' } | ConvertTo-Json -Compress
        exit 0
      }
    }
  }

  Stop-Process -Id $ProcessId -Force -ErrorAction Stop
  [pscustomobject]@{ method = 'forced' } | ConvertTo-Json -Compress
  exit 0
}
catch {
  if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
    [pscustomobject]@{ method = 'already_gone' } | ConvertTo-Json -Compress
    exit 0
  }
  Write-Error "Failed to stop process $ProcessId : $($_.Exception.Message)"
  exit 1
}
