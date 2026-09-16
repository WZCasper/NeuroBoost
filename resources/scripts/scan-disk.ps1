<#
  scan-disk.ps1
  Computes the real, current size of each cleanable category. Only ever
  looks at well-known temp/cache locations - never user documents, desktop,
  downloads (the folder, not the update-download cache), or anything else
  a person actually created.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Get-FolderSize {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return 0 }
  try {
    $sum = (Get-ChildItem -Path $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return 0 }
    return [int64]$sum
  }
  catch { return 0 }
}

function Get-RecycleBinSize {
  # Scan $Recycle.Bin on every fixed local drive, not just the system drive -
  # a machine with data on D:\ etc. can have real recycle-bin content there too.
  $total = [int64]0
  try {
    $drives = [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady }
    foreach ($drive in $drives) {
      $binPath = Join-Path $drive.RootDirectory.FullName '$Recycle.Bin'
      $sum = (Get-ChildItem $binPath -Recurse -Force -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
      if ($sum) { $total += [int64]$sum }
    }
  }
  catch { }
  return $total
}

$categories = New-Object System.Collections.Generic.List[object]

$categories.Add([pscustomobject]@{ id = 'temp_user'; sizeBytes = Get-FolderSize $env:TEMP })
$categories.Add([pscustomobject]@{ id = 'temp_system'; sizeBytes = Get-FolderSize (Join-Path $env:SystemRoot 'Temp') })
$categories.Add([pscustomobject]@{ id = 'recycle_bin'; sizeBytes = Get-RecycleBinSize })
$categories.Add([pscustomobject]@{ id = 'update_cache'; sizeBytes = Get-FolderSize (Join-Path $env:SystemRoot 'SoftwareDistribution\Download') })
$categories.Add([pscustomobject]@{ id = 'delivery_opt'; sizeBytes = Get-FolderSize (Join-Path $env:SystemRoot 'SoftwareDistribution\DeliveryOptimization\Cache') })
$categories.Add([pscustomobject]@{ id = 'error_reports'; sizeBytes = Get-FolderSize (Join-Path $env:ProgramData 'Microsoft\Windows\WER') })

# Enumerate every browser profile ("Default", "Profile 1", "Profile 2"...),
# not just Default: people with multiple profiles would otherwise be shown
# a fraction of what is actually on disk.
function Get-BrowserCachePaths {
  param([string]$UserDataPath)
  $paths = @()
  if (-not (Test-Path $UserDataPath)) { return $paths }
  Get-ChildItem -Path $UserDataPath -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' } |
    ForEach-Object {
      foreach ($sub in @('Cache', 'Code Cache', 'GPUCache')) {
        $p = Join-Path $_.FullName $sub
        if (Test-Path $p) { $paths += $p }
      }
    }
  return $paths
}

$chromePaths = Get-BrowserCachePaths (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data')
$chromeSize = ($chromePaths | ForEach-Object { Get-FolderSize $_ } | Measure-Object -Sum).Sum
$categories.Add([pscustomobject]@{ id = 'chrome_cache'; sizeBytes = [int64]($chromeSize | ForEach-Object { if ($_) { $_ } else { 0 } }) })

$edgePaths = Get-BrowserCachePaths (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data')
$edgeSize = ($edgePaths | ForEach-Object { Get-FolderSize $_ } | Measure-Object -Sum).Sum
$categories.Add([pscustomobject]@{ id = 'edge_cache'; sizeBytes = [int64]($edgeSize | ForEach-Object { if ($_) { $_ } else { 0 } }) })

$firefoxProfiles = Join-Path $env:LOCALAPPDATA 'Mozilla\Firefox\Profiles'
$ffSize = 0
if (Test-Path $firefoxProfiles) {
  $ffSize = (Get-ChildItem -Path $firefoxProfiles -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Get-FolderSize (Join-Path $_.FullName 'cache2') } | Measure-Object -Sum).Sum
}
if ($null -eq $ffSize) { $ffSize = 0 }
$categories.Add([pscustomobject]@{ id = 'firefox_cache'; sizeBytes = [int64]$ffSize })

ConvertTo-Json -InputObject $categories -Compress -Depth 3
