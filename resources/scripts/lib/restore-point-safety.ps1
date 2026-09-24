<#
  restore-point-safety.ps1
  Classifies why Checkpoint-Computer failed, so the UI can tell the user the
  difference between "already protected today" (Windows throttles
  MODIFY_SETTINGS checkpoints to one per 24h) and a real failure. Kept
  separate from create-restore-point.ps1 (which has real, non-idempotent
  side effects - it creates an actual restore point) so this pure text
  classification can be unit-tested on its own.
#>

# The documented PowerShell text for the throttled case (Microsoft Learn,
# Checkpoint-Computer) is: "A new system restore point cannot be created
# because one has already been created within the past 24 hours." Matched on
# that wording rather than on invented keywords (1440/frequency/too frequent
# never appear in it, so an earlier version of this check never matched even
# on an English system).
function Get-RestorePointFailureReason {
  param(
    [string]$ExceptionMessage,
    [bool]$WasEnabled
  )
  if ($ExceptionMessage -match 'already been created|within the past 24 hours|cannot be created') { return 'throttled' }
  if (-not $WasEnabled) { return 'disabled' }
  return 'error'
}
