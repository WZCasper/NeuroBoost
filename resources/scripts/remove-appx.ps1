<#
  remove-appx.ps1
  Removes one AppX package identified by PackageFamilyName, for the current
  user and de-provisioned so it doesn't reappear for new profiles.
  Reversible: it can be reinstalled from the Microsoft Store at any time.

  Re-validates safety at removal time (NonRemovable / framework / resource /
  denylist) instead of trusting whatever the caller passed in — this is the
  actual security boundary, not the list shown in the UI.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PackageFamilyName
)

$ErrorActionPreference = 'Stop'

$protectedNames = @(
  'Microsoft.WindowsStore', 'Microsoft.DesktopAppInstaller', 'Microsoft.WindowsCalculator',
  'Microsoft.WindowsNotepad', 'Microsoft.Windows.Photos',
  'Microsoft.Windows.ShellExperienceHost', 'Microsoft.Windows.StartMenuExperienceHost',
  'Microsoft.Windows.SecHealthUI', 'Microsoft.Windows.SecureAssessmentBrowser',
  'Microsoft.Windows.CloudExperienceHost', 'Microsoft.Windows.ContentDeliveryManager',
  'Microsoft.Windows.ParentalControls', 'Microsoft.Windows.PeopleExperienceHost',
  'Microsoft.Windows.PinningConfirmationDialog', 'Microsoft.Windows.NarratorQuickStart',
  'Microsoft.Windows.OOBENetworkCaptivePortal', 'Microsoft.Windows.OOBENetworkConnectionFlow',
  'Microsoft.Windows.AssignedAccessLockApp', 'Microsoft.Windows.CapturePicker',
  'Microsoft.Windows.XGpuEjectDialog', 'Microsoft.Windows.CBSPreview',
  'Microsoft.AAD.BrokerPlugin', 'Microsoft.AccountsControl', 'Microsoft.CredDialogHost',
  'Microsoft.ECApp', 'Microsoft.LockApp', 'Microsoft.MicrosoftEdge', 'Microsoft.MicrosoftEdgeDevToolsClient',
  'MicrosoftWindows.Client.CBS', 'MicrosoftWindows.Client.Core', 'MicrosoftWindows.Client.FileExp',
  'MicrosoftWindows.Client.WebExperience'
)

try {
  $pkg = Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue |
    Where-Object { $_.PackageFamilyName -eq $PackageFamilyName } |
    Select-Object -First 1

  if (-not $pkg) {
    Write-Output 'OK (already not installed)'
    exit 0
  }

  if ($pkg.NonRemovable -or $pkg.IsFramework -or $pkg.IsResourcePackage -or ($protectedNames -contains $pkg.Name)) {
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
