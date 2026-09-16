#Requires -Modules Pester

Describe 'set-priority.ps1' {
  BeforeAll {
    $scriptPath = Join-Path $PSScriptRoot '..\resources\scripts\set-priority.ps1'
  }

  It 'rejects RealTime and leaves the process priority unchanged' {
    $before = (Get-Process -Id $PID).PriorityClass
    { & $scriptPath -ProcessId $PID -Priority 'RealTime' 2>$null } | Should -Throw
    (Get-Process -Id $PID).PriorityClass | Should -Be $before
  }

  It 'accepts a valid priority and actually applies it' {
    $original = (Get-Process -Id $PID).PriorityClass
    try {
      & $scriptPath -ProcessId $PID -Priority 'AboveNormal' | Out-Null
      (Get-Process -Id $PID).PriorityClass | Should -Be 'AboveNormal'
    }
    finally {
      (Get-Process -Id $PID).PriorityClass = $original
    }
  }
}
