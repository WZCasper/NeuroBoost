<#
  remove-appx.ps1
  Removes one AppX package identified by PackageFamilyName, for the current
  user and de-provisioned so it doesn't reappear for new profiles.
  Reversible: it can be reinstalled from the Microsoft Store at any time.

  Re-validates safety at removal time (NonRemovable / framework / resource /
  denylist) instead of trusting whatever the caller passed in - this is the
  actual security boundary, not the list shown in the UI.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PackageFamilyName
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\appx-safety.ps1')

try {
  $pkg = Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue |
    Where-Object { $_.PackageFamilyName -eq $PackageFamilyName } |
    Select-Object -First 1

  if (-not $pkg) {
    Write-Output 'OK (already not installed)'
    exit 0
  }

  if (-not (Test-AppRemovable -Package $pkg)) {
    Write-Error "Refusing to remove '$($pkg.Name)': it is protected or a system component."
    exit 1
  }

  Remove-AppxPackage -Package $pkg.PackageFullName -AllUsers -ErrorAction Stop

  $provisioned = Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
    Where-Object { $_.PackageName -eq $pkg.Name }
  if ($provisioned) {
    $provisioned | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Out-Null
  }

  Write-Output 'OK'
  exit 0
}
catch {
  Write-Error "Failed to remove package: $($_.Exception.Message)"
  exit 1
}
