<#
  remove-appx.ps1
  Removes one AppX package (by exact name) for all current users and
  de-provisions it so it doesn't reappear for new user profiles.
  Reversible: the app can be reinstalled from the Microsoft Store at any time.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PackageName
)

$ErrorActionPreference = 'Stop'

try {
  $installed = Get-AppxPackage -Name $PackageName -AllUsers -ErrorAction SilentlyContinue
  if ($installed) {
    $installed | Remove-AppxPackage -AllUsers -ErrorAction Stop
  }

  $provisioned = Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq $PackageName }
  if ($provisioned) {
    $provisioned | Remove-AppxProvisionedPackage -Online -ErrorAction Stop | Out-Null
  }

  Write-Output 'OK'
  exit 0
}
catch {
  Write-Error "Failed to remove '$PackageName': $($_.Exception.Message)"
  exit 1
}
