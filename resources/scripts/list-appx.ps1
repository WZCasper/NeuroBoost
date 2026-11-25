<#
  list-appx.ps1
  Enumerates AppX packages that are ACTUALLY installed on this machine and
  safe to offer for removal. Safety comes from two layers:
    1. Windows' own `NonRemovable` flag, plus skipping frameworks/resource
       packages (shared runtime components, not "apps").
    2. An explicit denylist of core shell/security/identity components as a
       second line of defense, in case a future Windows build ever fails to
       flag something correctly.
  remove-appx.ps1 re-checks both of these again at removal time - this list
  is not itself a security boundary, just what's shown to the user.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\appx-safety.ps1')
. (Join-Path $PSScriptRoot 'lib\icon-extract.ps1')

try {
  $packages = Get-AppxPackage |
    Where-Object { Test-AppRemovable -Package $_ } |
    Sort-Object Name -Unique

  $result = foreach ($p in $packages) {
    $displayName = $p.Name
    $icon = $null
    try {
      $manifest = Get-AppxPackageManifest -Package $p.PackageFullName -ErrorAction Stop
      $dn = $manifest.Package.Properties.DisplayName
      if ($dn -and -not $dn.ToString().StartsWith('ms-resource:')) {
        $displayName = $dn.ToString()
      }
      # Application is an array when a package declares more than one entry
      # point; its .VisualElements.Square44x44Logo would then also be an
      # array (PowerShell's member enumeration), and casting that straight
      # to [string] would join every path with a space. Only the first
      # entry point's logo is used - that is the one Windows itself shows.
      $logoRelativePath = @($manifest.Package.Applications.Application)[0].VisualElements.Square44x44Logo
      if ($logoRelativePath) {
        $icon = Get-AppxIconDataUri -InstallLocation $p.InstallLocation -LogoRelativePath ([string]$logoRelativePath)
      }
    } catch {
      # Keep the raw package Name as a fallback, and no icon - not fatal.
    }

    [pscustomobject]@{
      id             = $p.PackageFamilyName
      name           = $displayName
      recommendation = Get-AppRecommendation -Name $p.Name
      icon           = $icon
    }
  }

  ConvertTo-Json -InputObject $result -Compress -Depth 3
}
catch {
  Write-Error "Failed to enumerate installed apps: $($_.Exception.Message)"
  exit 1
}
