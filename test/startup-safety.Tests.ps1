#Requires -Modules Pester

BeforeAll {
  . (Join-Path $PSScriptRoot '..\resources\scripts\lib\startup-safety.ps1')

  $script:base = Join-Path ([System.IO.Path]::GetTempPath()) ('nb-startup-' + [guid]::NewGuid())
  $script:userStartup = Join-Path $script:base 'UserStartup'
  $script:commonStartup = Join-Path $script:base 'CommonStartup'
  $script:disabledDir = Join-Path $script:userStartup '_NeuroBoost_Disabled'
  New-Item -ItemType Directory -Force -Path $script:userStartup, $script:commonStartup, $script:disabledDir | Out-Null
  $script:roots = @($script:userStartup, $script:commonStartup)
}

AfterAll {
  Remove-Item -Recurse -Force -LiteralPath $script:base -ErrorAction SilentlyContinue
}

Describe 'Resolve-StartupShortcut' {
  It 'accepts a .lnk directly in the per-user Startup folder' {
    $p = Join-Path $script:userStartup 'a.lnk'
    Resolve-StartupShortcut -Path $p -Roots $script:roots | Should -Be ([System.IO.Path]::GetFullPath($p))
  }

  It 'accepts a .lnk directly in the all-users Startup folder' {
    { Resolve-StartupShortcut -Path (Join-Path $script:commonStartup 'b.lnk') -Roots $script:roots } | Should -Not -Throw
  }

  It 'accepts a .lnk inside the _NeuroBoost_Disabled subfolder' {
    { Resolve-StartupShortcut -Path (Join-Path $script:disabledDir 'c.lnk') -Roots $script:roots } | Should -Not -Throw
  }

  It 'treats the extension case-insensitively' {
    { Resolve-StartupShortcut -Path (Join-Path $script:userStartup 'd.LNK') -Roots $script:roots } | Should -Not -Throw
  }

  It 'accepts a shortcut whose name contains wildcard characters' {
    { Resolve-StartupShortcut -Path (Join-Path $script:userStartup '[x].lnk') -Roots $script:roots } | Should -Not -Throw
  }

  It 'refuses a file that is not a .lnk, even inside Startup' {
    { Resolve-StartupShortcut -Path (Join-Path $script:userStartup 'calc.exe') -Roots $script:roots } | Should -Throw
  }

  It 'refuses a file outside every Startup folder' {
    { Resolve-StartupShortcut -Path (Join-Path $script:base 'secret.lnk') -Roots $script:roots } | Should -Throw
  }

  It 'refuses a path that climbs out of Startup with ".."' {
    { Resolve-StartupShortcut -Path ($script:userStartup + '/../secret.lnk') -Roots $script:roots } | Should -Throw
    { Resolve-StartupShortcut -Path ($script:userStartup + '/_NeuroBoost_Disabled/../../secret.lnk') -Roots $script:roots } | Should -Throw
  }

  It 'refuses a sibling folder that merely shares the Startup folder name as a prefix' {
    { Resolve-StartupShortcut -Path ($script:userStartup + 'Evil/x.lnk') -Roots $script:roots } | Should -Throw
  }

  It 'refuses a shortcut nested in an arbitrary subfolder' {
    { Resolve-StartupShortcut -Path (Join-Path (Join-Path $script:userStartup 'sub') 'e.lnk') -Roots $script:roots } | Should -Throw
  }
}
