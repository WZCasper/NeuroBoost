<#
  icon-extract.ps1
  Shared icon extraction, used by list-startup.ps1 (for Run-key/shortcut
  targets) and list-appx.ps1 (for Store-app packages). Returns a
  "data:image/png;base64,..." URI the renderer can drop straight into an
  <img src="...">, or $null if no icon could be found - callers always
  treat a missing icon as "show the generic placeholder", never an error.

  IMPORTANT: every System.Drawing type is referenced through
  [System.Type]::GetType(...) + reflection, NEVER as a direct [Type.Name]
  literal. A literal type reference is resolved by PowerShell's parser
  while the whole script is being compiled, before any try/catch around it
  ever runs - on a machine without the native GDI+ library (some Windows
  SKUs ship without it; confirmed via Microsoft's own documentation, and
  reproduced directly: a script that merely *mentions*
  [System.Drawing.Imaging.ImageFormat] fails to dot-source at all, with no
  code in it ever running, while the identical logic through GetType()
  dot-sources fine and only fails - catchably - at the point of use).
  This keeps icon extraction a true "nice to have": its complete absence
  never breaks list-startup.ps1 or list-appx.ps1, which dot-source this file.
#>

function Get-SystemDrawingTypes {
  try {
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $icon = [System.Type]::GetType('System.Drawing.Icon, System.Drawing')
    $imageFormat = [System.Type]::GetType('System.Drawing.Imaging.ImageFormat, System.Drawing')
    if (-not $icon -or -not $imageFormat) { return $null }
    return @{ Icon = $icon; ImageFormat = $imageFormat }
  } catch {
    return $null
  }
}

$script:DrawingTypes = Get-SystemDrawingTypes

function Get-ExecutablePathFromCommandLine {
  param([string]$CommandLine)
  if (-not $CommandLine) { return $null }
  $trimmed = $CommandLine.Trim()
  if ($trimmed.StartsWith('"')) {
    $end = $trimmed.IndexOf('"', 1)
    if ($end -gt 0) { return $trimmed.Substring(1, $end - 1) }
    return $null
  }
  $spaceIndex = $trimmed.IndexOf(' ')
  if ($spaceIndex -gt 0) { return $trimmed.Substring(0, $spaceIndex) }
  return $trimmed
}

function Get-ExeIconDataUri {
  param([string]$Path)
  if (-not $script:DrawingTypes) { return $null }
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $null }

  try {
    $staticFlags = [System.Reflection.BindingFlags]'Public,Static'
    $instanceFlags = [System.Reflection.BindingFlags]'Public,Instance'

    $extractMethod = $script:DrawingTypes.Icon.GetMethod('ExtractAssociatedIcon', $staticFlags)
    $icon = $extractMethod.Invoke($null, @($Path))
    if (-not $icon) { return $null }

    try {
      $toBitmap = $icon.GetType().GetMethod('ToBitmap', $instanceFlags)
      $bitmap = $toBitmap.Invoke($icon, @())
      try {
        $stream = New-Object System.IO.MemoryStream
        try {
          $pngFormat = $script:DrawingTypes.ImageFormat.GetProperty('Png', $staticFlags).GetValue($null)
          $saveMethod = $bitmap.GetType().GetMethod('Save', @([System.IO.Stream], $script:DrawingTypes.ImageFormat))
          $saveMethod.Invoke($bitmap, @($stream, $pngFormat))
          $base64 = [Convert]::ToBase64String($stream.ToArray())
          return 'data:image/png;base64,' + $base64
        }
        finally { $stream.Dispose() }
      }
      finally { $bitmap.Dispose() }
    }
    finally { $icon.Dispose() }
  }
  catch {
    return $null
  }
}

function Get-AppxIconDataUri {
  param(
    [string]$InstallLocation,
    [string]$LogoRelativePath
  )
  if (-not $InstallLocation -or -not $LogoRelativePath) { return $null }
  if (-not (Test-Path -LiteralPath $InstallLocation)) { return $null }

  try {
    $dir = Join-Path $InstallLocation (Split-Path -Path $LogoRelativePath -Parent)
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($LogoRelativePath)
    if (-not (Test-Path -LiteralPath $dir)) { return $null }

    $candidate = Get-ChildItem -LiteralPath $dir -Filter "$baseName*" -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -in @('.png', '.jpg', '.jpeg') } |
      Select-Object -First 1
    if (-not $candidate) { return $null }

    $bytes = [System.IO.File]::ReadAllBytes($candidate.FullName)
    $mime = if ($candidate.Extension -eq '.png') { 'image/png' } else { 'image/jpeg' }
    return 'data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes)
  }
  catch {
    return $null
  }
}
