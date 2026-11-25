<#
  startup-recommendations.ps1
  Classifies a startup entry as "safe" (commonly disabled without breaking
  anything) or unclassified (no opinion either way - most startup entries
  fall here, deliberately: this is explicit known-name matching, never
  heuristic or behavior-based detection, the same approach as
  appx-safety.ps1's app recommendations).

  The list reflects the consistent, cross-source consensus on what
  consumer-facing startup programs are commonly disabled without issue
  (messaging/media apps, game launchers, software updaters) versus what to
  leave alone (security software, audio/input drivers, vendor system
  utilities). When in doubt, an entry is left unclassified rather than
  guessed at - a wrong "safe" label here is far more costly than simply
  not labeling something.
#>

$Global:NB_StartupSafePatterns = [ordered]@{
  'discord'                    = 'startup.appDiscord'
  'slack'                      = 'startup.appSlack'
  'skype'                      = 'startup.appSkype'
  'spotify'                    = 'startup.appSpotify'
  'steam'                      = 'startup.appSteam'
  'epicgameslauncher'          = 'startup.appEpic'
  'origin'                     = 'startup.appOrigin'
  'battle\.net'                = 'startup.appBattleNet'
  'googleupdate'               = 'startup.appGoogleUpdate'
  'adobe.*updater'             = 'startup.appAdobeUpdater'
  'acrobat.*update'            = 'startup.appAdobeUpdater'
  '^itunes'                    = 'startup.appITunes'
  'teamsmachineinstaller'      = 'startup.appTeams'
  '^com\.squirrel\.teams\.teams$' = 'startup.appTeams'
}

$Global:NB_StartupNeverSafePatterns = @(
  'defender', 'securityhealth', 'mcafee', 'norton', 'avast', 'avg\b', 'kaspersky',
  'bitdefender', 'eset', 'malwarebytes', 'realtek', 'synaptics', 'elan', 'nvidia.*container',
  'nvcontainer', 'amd.*software'
)

function Get-StartupRecommendation {
  param([Parameter(Mandatory = $true)][string]$Name)
  $lower = $Name.ToLowerInvariant()
  foreach ($p in $Global:NB_StartupNeverSafePatterns) {
    if ($lower -match $p) { return $null }
  }
  foreach ($pattern in $Global:NB_StartupSafePatterns.Keys) {
    if ($lower -match $pattern) { return $Global:NB_StartupSafePatterns[$pattern] }
  }
  return $null
}
