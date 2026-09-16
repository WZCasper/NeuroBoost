#Requires -Modules Pester

BeforeAll {
  . (Join-Path $PSScriptRoot '..\resources\scripts\lib\appx-safety.ps1')
}

Describe 'Test-AppRemovable' {
  It 'refuses a package flagged NonRemovable by Windows' {
    $pkg = [pscustomobject]@{ Name = 'Some.Random.App'; NonRemovable = $true; IsFramework = $false; IsResourcePackage = $false }
    Test-AppRemovable -Package $pkg | Should -BeFalse
  }

  It 'refuses a framework package' {
    $pkg = [pscustomobject]@{ Name = 'Microsoft.VCLibs.140.00'; NonRemovable = $false; IsFramework = $true; IsResourcePackage = $false }
    Test-AppRemovable -Package $pkg | Should -BeFalse
  }

  It 'refuses a resource package' {
    $pkg = [pscustomobject]@{ Name = 'Some.App.resources'; NonRemovable = $false; IsFramework = $false; IsResourcePackage = $true }
    Test-AppRemovable -Package $pkg | Should -BeFalse
  }

  It 'refuses anything on the explicit denylist even if Windows does not flag it NonRemovable' {
    $pkg = [pscustomobject]@{ Name = 'Microsoft.WindowsCalculator'; NonRemovable = $false; IsFramework = $false; IsResourcePackage = $false }
    Test-AppRemovable -Package $pkg | Should -BeFalse
  }

  It 'allows an ordinary removable app' {
    $pkg = [pscustomobject]@{ Name = 'Microsoft.BingWeather'; NonRemovable = $false; IsFramework = $false; IsResourcePackage = $false }
    Test-AppRemovable -Package $pkg | Should -BeTrue
  }
}

Describe 'Get-AppRecommendation' {
  It 'flags known ad-bundled software as insist' {
    Get-AppRecommendation -Name 'king.com.CandyCrushSaga' | Should -Be 'insist'
  }

  It 'flags Microsoft first-party soft-bloat as suggest' {
    Get-AppRecommendation -Name 'Microsoft.BingWeather' | Should -Be 'suggest'
  }

  It 'returns null for an unrecognized app' {
    Get-AppRecommendation -Name 'SomeRandomCompany.SomeApp' | Should -BeNullOrEmpty
  }

  It 'is case-insensitive' {
    Get-AppRecommendation -Name 'MICROSOFT.BINGWEATHER' | Should -Be 'suggest'
  }
}
