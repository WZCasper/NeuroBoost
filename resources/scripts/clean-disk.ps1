<#
  clean-disk.ps1
  Deletes the selected categories (see scan-disk.ps1 for what each one is).
  Locked/in-use files are skipped, not treated as a fatal error - this
  script reports how much was actually freed, measured before/after, not
  an assumed number. Never touches anything outside the fixed set of
  temp/cache paths below.

  OUTPUT: one compact JSON object per line as each category finishes:
    {"event":"category","id":"temp_user","freedBytes":123456}
    {"event":"summary","freedBytes":789012,"categories":[...]}
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CategoryIds
)

$ErrorActionPreference = 'Stop'
$selected = $CategoryIds.Split(',') | Where-Object { $_ }

function Get-FolderSize {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return 0 }
  try {
    $sum = (Get-ChildItem -Path $Path -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return 0 }
    return [int64]$sum
  }
  catch { return 0 }
}

function Clear-FolderContents {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-ChildItem -Path $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
    try { Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction Stop }
    catch { } # locked/in-use - skip, not fatal
  }
}

$results = New-Object System.Collections.Generic.List[object]
$totalFreed = [int64]0

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

function Get-FirefoxCachePaths {
  $paths = @()
  $root = Join-Path $env:LOCALAPPDATA 'Mozilla\Firefox\Profiles'
  if (-not (Test-Path $root)) { return $paths }
  Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Join-Path $_.FullName 'cache2'
    if (Test-Path $p) { $paths += $p }
  }
  return $paths
}

function Get-RecycleBinSize {
  $total = [int64]0
  $drives = [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady }
  foreach ($drive in $drives) {
    $binPath = Join-Path $drive.RootDirectory.FullName '$Recycle.Bin'
    $sum = (Get-ChildItem $binPath -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    if ($sum) { $total += [int64]$sum }
  }
  return $total
}

foreach ($id in $selected) {
  $targetPaths = @()
  switch ($id) {
    'temp_user' { $targetPaths = @($env:TEMP) }
    'temp_system' { $targetPaths = @((Join-Path $env:SystemRoot 'Temp')) }
    'recycle_bin' { $targetPaths = @() } # handled separately below
    'update_cache' { $targetPaths = @((Join-Path $env:SystemRoot 'SoftwareDistribution\Download')) }
    'delivery_opt' { $targetPaths = @((Join-Path $env:SystemRoot 'SoftwareDistribution\DeliveryOptimization\Cache')) }
    'error_reports' {
      $p = Join-Path $env:ProgramData 'Microsoft\Windows\WER'
      $targetPaths = @((Join-Path $p 'ReportArchive'), (Join-Path $p 'ReportQueue'))
    }
    'chrome_cache' { $targetPaths = @(Get-BrowserCachePaths (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data')) }
    'edge_cache' { $targetPaths = @(Get-BrowserCachePaths (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data')) }
    'firefox_cache' { $targetPaths = @(Get-FirefoxCachePaths) }
    default { continue }
  }

  if ($id -eq 'recycle_bin') {
    $before = Get-RecycleBinSize
    Clear-RecycleBin -Force -ErrorAction SilentlyContinue
    $after = Get-RecycleBinSize
  }
  elseif ($id -eq 'update_cache') {
    $before = ($targetPaths | ForEach-Object { Get-FolderSize $_ } | Measure-Object -Sum).Sum
    try {
      Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue
      $targetPaths | ForEach-Object { Clear-FolderContents $_ }
    }
    finally {
      Start-Service -Name wuauserv -ErrorAction SilentlyContinue
    }
    $after = ($targetPaths | ForEach-Object { Get-FolderSize $_ } | Measure-Object -Sum).Sum
  }
  else {
    $before = ($targetPaths | ForEach-Object { Get-FolderSize $_ } | Measure-Object -Sum).Sum
    $targetPaths | ForEach-Object { Clear-FolderContents $_ }
    $after = ($targetPaths | ForEach-Object { Get-FolderSize $_ } | Measure-Object -Sum).Sum
  }

  if ($null -eq $before) { $before = 0 }
  if ($null -eq $after) { $after = 0 }
  $freed = [Math]::Max(0, [int64]$before - [int64]$after)
  $totalFreed += $freed

  $results.Add([pscustomobject]@{ id = $id; freedBytes = $freed })
  [pscustomobject]@{ event = 'category'; id = $id; freedBytes = $freed } | ConvertTo-Json -Compress
  [Console]::Out.Flush()
}

$summary = [pscustomobject]@{
  event      = 'summary'
  freedBytes = $totalFreed
  categories = $results
}
ConvertTo-Json -InputObject $summary -Compress -Depth 4
