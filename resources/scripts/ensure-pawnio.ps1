<#
  ensure-pawnio.ps1
  Installs the PawnIO driver silently if it is not already present, then
  reports whether temperature reading is now possible. This is the only
  script in the project that installs a kernel driver - kept separate from
  get-hardware-temps.ps1 so installation (slow, one-time, needs the bundled
  installer) and reading sensors (fast, repeated) are two distinct,
  independently testable actions.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Test-PawnIoInstalled {
  $candidates = @(
    'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO',
    'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\PawnIO',
    'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\PawnIO'
  )
  foreach ($path in $candidates) {
    if (Test-Path -LiteralPath $path) { return $true }
  }
  return $false
}

try {
  if (Test-PawnIoInstalled) {
    [pscustomobject]@{ installed = $true; alreadyPresent = $true } | ConvertTo-Json -Compress
    exit 0
  }

  $installerPath = Join-Path $PSScriptRoot '..\bin\PawnIO_setup.exe'
  if (-not (Test-Path -LiteralPath $installerPath)) {
    [pscustomobject]@{ installed = $false; error = 'Installer not found alongside the application.' } | ConvertTo-Json -Compress
    exit 0
  }

  Unblock-File -LiteralPath $installerPath -ErrorAction SilentlyContinue

  $proc = Start-Process -FilePath $installerPath -ArgumentList '-install', '-silent' -Wait -PassThru -NoNewWindow
  $exitCode = $proc.ExitCode

  $nowInstalled = Test-PawnIoInstalled
  [pscustomobject]@{
    installed      = $nowInstalled
    alreadyPresent = $false
    exitCode       = $exitCode
  } | ConvertTo-Json -Compress
}
catch {
  [pscustomobject]@{ installed = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
