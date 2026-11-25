<#
  disk-recommendations.ps1
  Marks which disk-cleanup categories are safe to clear without harming
  Windows or losing anything important, with a short honest note for each -
  this is NOT a blanket "always safe" label, since a couple of these
  categories have real, if minor, user-facing side effects worth knowing
  about even though they never put Windows itself at risk.

  Every category clean-disk.ps1 offers was checked against the consistent
  cross-source consensus (Microsoft's own support answers, and Windows'
  built-in Disk Cleanup already offering these same categories by default):
  all nine are system-safe. The distinction made here is purely about side
  effects a person might want to know before clicking - never about
  system risk.
#>

$Global:NB_DiskSafeCategories = [ordered]@{
  'temp_user'     = 'disk.safeTempUser'
  'temp_system'   = 'disk.safeTempSystem'
  'update_cache'  = 'disk.safeUpdateCache'
  'delivery_opt'  = 'disk.safeDeliveryOpt'
  'error_reports' = 'disk.safeErrorReports'
  'recycle_bin'   = 'disk.safeRecycleBin'
  'chrome_cache'  = 'disk.safeBrowserCache'
  'edge_cache'    = 'disk.safeBrowserCache'
  'firefox_cache' = 'disk.safeBrowserCache'
}

function Get-DiskCategoryRecommendation {
  param([Parameter(Mandatory = $true)][string]$CategoryId)
  if ($Global:NB_DiskSafeCategories.Contains($CategoryId)) {
    return $Global:NB_DiskSafeCategories[$CategoryId]
  }
  return $null
}
