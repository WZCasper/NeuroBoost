<#
  appx-safety.ps1
  Single source of truth for what NeuroBoost will and won't offer to
  remove. Dot-sourced by both list-appx.ps1 (what to show) and
  remove-appx.ps1 (re-checked again right before actually removing) - this
  used to be duplicated in both files, which is a real risk: fixing/
  extending the list in only one place would silently weaken the other.
#>

$Global:NB_ProtectedAppNames = @(
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

function Test-AppRemovable {
  <#
    Returns $true only if a package is safe to offer/perform removal on:
    not flagged NonRemovable by Windows itself, not a shared framework or
    resource package, and not in the explicit denylist above.
  #>
  param([Parameter(Mandatory = $true)]$Package)

  if ($Package.NonRemovable) { return $false }
  if ($Package.IsFramework) { return $false }
  if ($Package.IsResourcePackage) { return $false }
  if ($Global:NB_ProtectedAppNames -contains $Package.Name) { return $false }
  return $true
}

# Name-pattern classification shown to the user - explicitly NOT malware or
# usage-based detection, just known-name matching (see the caller's UI copy).
$Global:NB_InsistPatterns = @(
  'candycrush', 'king\.com', 'farmville', 'marchofempires', 'wildtangent', 'bubblewitch',
  'royalrevolt', 'asphalt', 'hiddencity', 'cookingfever', 'dropbox', 'mcafee', 'norton',
  'keeper', 'evernote', 'spotifyab\.spotifymusic', 'disney', 'hulu\b'
)
$Global:NB_SuggestPatterns = @(
  'bingweather', 'bingnews', 'getstarted', 'microsoftofficehub', 'solitairecollection',
  '^microsoft\.people$', 'windowsfeedbackhub', 'zunemusic', 'zunevideo', '^microsoft\.skypeapp$',
  'xboxgamingoverlay', '^microsoft\.gamingapp$', '^microsoft\.yourphone$', 'mixedreality\.portal',
  '^microsoft\.3dbuilder$', 'poweraut', 'clipchamp', '549981c3f5f10'
)

function Get-AppRecommendation {
  param([Parameter(Mandatory = $true)][string]$Name)
  $lower = $Name.ToLowerInvariant()
  foreach ($p in $Global:NB_InsistPatterns) { if ($lower -match $p) { return 'insist' } }
  foreach ($p in $Global:NB_SuggestPatterns) { if ($lower -match $p) { return 'suggest' } }
  return $null
}
