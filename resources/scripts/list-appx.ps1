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

# Classification is name-pattern based, not malware/usage scanning - it is
# shown to the user as such. 'insist' = known ad-bundled / promo software
# with no general legitimate use case. 'suggest' = Microsoft's own optional
# first-party apps most people don't use but that are not harmful.
$insistPatterns = @(
  'candycrush', 'king\.com', 'farmville', 'marchofempires', 'wildtangent', 'bubblewitch',
  'royalrevolt', 'asphalt', 'hiddencity', 'cookingfever', 'dropbox', 'mcafee', 'norton',
  'keeper', 'evernote', 'spotifyab\.spotifymusic', 'disney', 'hulu\b'
)
$suggestPatterns = @(
  'bingweather', 'bingnews', 'getstarted', 'microsoftofficehub', 'solitairecollection',
  '^microsoft\.people$', 'windowsfeedbackhub', 'zunemusic', 'zunevideo', '^microsoft\.skypeapp$',
  'xboxgamingoverlay', '^microsoft\.gamingapp$', '^microsoft\.yourphone$', 'mixedreality\.portal',
  '^microsoft\.3dbuilder$', 'poweraut', 'clipchamp', '549981c3f5f10'
)

function Get-Recommendation {
  param([string]$Name)
  $lower = $Name.ToLowerInvariant()
  foreach ($p in $insistPatterns) { if ($lower -match $p) { return 'insist' } }
  foreach ($p in $suggestPatterns) { if ($lower -match $p) { return 'suggest' } }
  return $null
}

try {
  $packages = Get-AppxPackage |
    Where-Object {
      -not $_.NonRemovable -and
      -not $_.IsFramework -and
      -not $_.IsResourcePackage -and
      ($protectedNames -notcontains $_.Name)
    } |
    Sort-Object Name -Unique

  $result = foreach ($p in $packages) {
    $displayName = $p.Name
    try {
      $manifest = Get-AppxPackageManifest -Package $p.PackageFullName -ErrorAction Stop
      $dn = $manifest.Package.Properties.DisplayName
      if ($dn -and -not $dn.ToString().StartsWith('ms-resource:')) {
        $displayName = $dn.ToString()
      }
    } catch {
      # Keep the raw package Name as a fallback - not fatal.
    }

    [pscustomobject]@{
      id             = $p.PackageFamilyName
      name           = $displayName
      recommendation = Get-Recommendation -Name $p.Name
    }
  }

  ConvertTo-Json -InputObject $result -Compress -Depth 3
}
catch {
  Write-Error "Failed to enumerate installed apps: $($_.Exception.Message)"
  exit 1
}
