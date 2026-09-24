#Requires -Modules Pester

BeforeAll {
  . (Join-Path $PSScriptRoot '..\resources\scripts\lib\restore-point-safety.ps1')

  # The exact text documented by Microsoft Learn for Checkpoint-Computer
  # (Microsoft.PowerShell.Management) when a MODIFY_SETTINGS checkpoint is
  # attempted within 24 hours of the last one.
  $script:documentedThrottleMessage = 'A new system restore point cannot be created because one has already been created within the past 24 hours. Please try again later.'
}

Describe 'Get-RestorePointFailureReason' {
  It 'recognises the documented Microsoft throttling message' {
    Get-RestorePointFailureReason -ExceptionMessage $script:documentedThrottleMessage -WasEnabled $true | Should -Be 'throttled'
  }

  It 'reports disabled when System Protection was off and the message is unrelated' {
    Get-RestorePointFailureReason -ExceptionMessage 'Access is denied.' -WasEnabled $false | Should -Be 'disabled'
  }

  It 'reports error when protection was on and the message is unrelated' {
    Get-RestorePointFailureReason -ExceptionMessage 'Access is denied.' -WasEnabled $true | Should -Be 'error'
  }

  It 'prefers throttled over disabled when both could apply' {
    # If Windows itself says "already created", protection is evidently on,
    # regardless of what Test-SystemRestoreEnabled happened to observe.
    Get-RestorePointFailureReason -ExceptionMessage $script:documentedThrottleMessage -WasEnabled $false | Should -Be 'throttled'
  }

  It 'does not misclassify an unrelated VSS error as throttled' {
    Get-RestorePointFailureReason -ExceptionMessage 'The volume shadow copy operation failed with error code 0x80042302.' -WasEnabled $true | Should -Be 'error'
  }

  It 'does not misclassify a disabled-protection error as throttled' {
    Get-RestorePointFailureReason -ExceptionMessage 'System Restore is currently turned off for this drive.' -WasEnabled $false | Should -Be 'disabled'
  }
}
