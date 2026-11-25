#Requires -Modules Pester

BeforeAll {
  . (Join-Path $PSScriptRoot '..\resources\scripts\lib\startup-recommendations.ps1')
}

Describe 'Get-StartupRecommendation' {
  It 'recommends common consumer apps known to be safe to disable' {
    Get-StartupRecommendation -Name 'Discord' | Should -Not -BeNullOrEmpty
    Get-StartupRecommendation -Name 'Spotify' | Should -Not -BeNullOrEmpty
    Get-StartupRecommendation -Name 'GoogleUpdate' | Should -Not -BeNullOrEmpty
    Get-StartupRecommendation -Name 'Steam' | Should -Not -BeNullOrEmpty
  }

  It 'never recommends security software' {
    Get-StartupRecommendation -Name 'Windows Defender notification icon' | Should -BeNullOrEmpty
    Get-StartupRecommendation -Name 'avast! Antivirus' | Should -BeNullOrEmpty
    Get-StartupRecommendation -Name 'Norton Security' | Should -BeNullOrEmpty
  }

  It 'never recommends core audio/input drivers or vendor system utilities' {
    Get-StartupRecommendation -Name 'RtkAudUService64' | Should -BeNullOrEmpty
    Get-StartupRecommendation -Name 'Synaptics Pointing Device Driver' | Should -BeNullOrEmpty
    Get-StartupRecommendation -Name 'Dell SupportAssist' | Should -BeNullOrEmpty
    Get-StartupRecommendation -Name 'NVIDIA Container' | Should -BeNullOrEmpty
  }

  It 'stays silent (no opinion) on an unrecognized program' {
    Get-StartupRecommendation -Name 'SomeCompanyXYZUpdater' | Should -BeNullOrEmpty
    Get-StartupRecommendation -Name 'MyCustomInternalTool' | Should -BeNullOrEmpty
  }

  It 'is case-insensitive' {
    Get-StartupRecommendation -Name 'DISCORD' | Should -Not -BeNullOrEmpty
    Get-StartupRecommendation -Name 'discord' | Should -Not -BeNullOrEmpty
  }

  It 'lets the never-safe list override a safe-pattern match' {
    # No real entry in the current lists conflicts, so this proves the
    # MECHANISM is safety-first independent of today's two lists: a future
    # addition to either list cannot silently flip a dangerous entry to safe.
    $Global:NB_StartupSafePatterns['pesterconflicttest'] = 'startup.test'
    $Global:NB_StartupNeverSafePatterns += 'pesterconflict'
    try {
      Get-StartupRecommendation -Name 'PesterConflictTestApp' | Should -BeNullOrEmpty
    } finally {
      $Global:NB_StartupSafePatterns.Remove('pesterconflicttest')
      $Global:NB_StartupNeverSafePatterns = $Global:NB_StartupNeverSafePatterns | Where-Object { $_ -ne 'pesterconflict' }
    }
  }
}
