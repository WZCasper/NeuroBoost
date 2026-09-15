<#
  list-startup.ps1
  Lists programs that launch automatically with Windows: the three Run
  registry keys (per-user, per-machine, and the 32-bit view on 64-bit
  Windows) plus shortcuts in the two Startup folders. Enabled/disabled
  state for Run-key entries mirrors what Task Manager's own Startup tab
  uses (the StartupApproved binary flag), so toggling here matches what
  you would see there. Startup-folder items are considered "disabled" if
  NeuroBoost has moved their shortcut into a _NeuroBoost_Disabled
  subfolder (see toggle-startup.ps1).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$items = New-Object System.Collections.Generic.List[object]

$runPaths = @(
  @{ path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; scope = 'user'; approvedKey = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' },
  @{ path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; scope = 'machine'; approvedKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' },
  @{ path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; scope = 'machine32'; approvedKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32' }
)

foreach ($rp in $runPaths) {
  if (-not (Test-Path $rp.path)) { continue }
  $props = Get-ItemProperty -Path $rp.path -ErrorAction SilentlyContinue
  if (-not $props) { continue }

  $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
    $name = $_.Name
    $command = [string]$_.Value
    $enabled = $true
    if (Test-Path $rp.approvedKey) {
      $ap = Get-ItemProperty -Path $rp.approvedKey -Name $name -ErrorAction SilentlyContinue
      if ($ap -and $ap.$name -and $ap.$name.Length -gt 0 -and $ap.$name[0] -eq 3) {
        $enabled = $false
      }
    }
    $items.Add([pscustomobject]@{
      id      = "run|$($rp.scope)|$name"
      type    = 'run'
      name    = $name
      command = $command
      enabled = $enabled
    })
  }
}

$disabledFolderName = '_NeuroBoost_Disabled'
$folders = @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('CommonStartup')) | Select-Object -Unique

foreach ($folder in $folders) {
  if (-not (Test-Path $folder)) { continue }

  Get-ChildItem -Path $folder -Filter '*.lnk' -File -ErrorAction SilentlyContinue | ForEach-Object {
    $items.Add([pscustomobject]@{
      id      = "folder||$($_.FullName)"
      type    = 'folder'
      name    = $_.BaseName
      command = $_.FullName
      enabled = $true
    })
  }

  $disabledPath = Join-Path $folder $disabledFolderName
  if (Test-Path $disabledPath) {
    Get-ChildItem -Path $disabledPath -Filter '*.lnk' -File -ErrorAction SilentlyContinue | ForEach-Object {
      $items.Add([pscustomobject]@{
        id      = "folder||$($_.FullName)"
        type    = 'folder'
        name    = $_.BaseName
        command = $_.FullName
        enabled = $false
      })
    }
  }
}

ConvertTo-Json -InputObject $items -Compress -Depth 3
