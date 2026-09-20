<#
  startup-safety.ps1
  Single source of truth for which files toggle-startup.ps1 is allowed to
  move. Dot-sourced by the script itself and by its Pester tests, so the test
  exercises the real rule instead of a copy of it.

  toggle-startup.ps1 runs as Administrator and moves a file whose path
  arrives from the UI. That path is not trusted: only a .lnk that sits
  directly inside one of the two real Startup folders (or their
  _NeuroBoost_Disabled subfolder) - exactly what list-startup.ps1 reports -
  may ever be moved.
#>

function Get-StartupRoots {
  # Overridable for tests; production uses the real per-user and all-users
  # Startup folders.
  @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('CommonStartup')) |
    Where-Object { $_ }
}

function Resolve-StartupShortcut {
  <#
    Returns the full, normalised path if $Path is an allowed startup
    shortcut; otherwise throws. Normalisation happens BEFORE the comparison,
    so "..", mixed separators and case differences cannot slip past it.
  #>
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string[]]$Roots = (Get-StartupRoots)
  )

  $resolved = [System.IO.Path]::GetFullPath($Path)
  $parentDir = [System.IO.Path]::GetDirectoryName($resolved)

  $allowed = $false
  foreach ($root in $Roots) {
    $fullRoot = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/')
    $disabled = Join-Path $fullRoot '_NeuroBoost_Disabled'
    if ($parentDir -ieq $fullRoot -or $parentDir -ieq $disabled) { $allowed = $true }
  }

  if (-not $allowed -or [System.IO.Path]::GetExtension($resolved) -ine '.lnk') {
    throw "Refusing to move '$Path': it is not a shortcut in a Windows Startup folder."
  }
  return $resolved
}
