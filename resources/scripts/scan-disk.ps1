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
  try {
    $sum = (Get-ChildItem 'C:\$Recycle.Bin' -Recurse -Force -File -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return 0 }
    return [int64]$sum
  }
  catch { return 0 }
}

$categories = New-Object System.Collections.Generic.List[object]

$categories.Add([pscustomobject]@{ id = 'temp_user'; sizeBytes = Get-FolderSize $env:TEMP })
$categories.Add([pscustomobject]@{ id = 'temp_system'; sizeBytes = Get-FolderSize 'C:\Windows\Temp' })
$categories.Add([pscustomobject]@{ id = 'recycle_bin'; sizeBytes = Get-RecycleBinSize })
$categories.Add([pscustomobject]@{ id = 'update_cache'; sizeBytes = Get-FolderSize 'C:\Windows\SoftwareDistribution\Download' })
$categories.Add([pscustomobject]@{ id = 'delivery_opt'; sizeBytes = Get-FolderSize 'C:\Windows\SoftwareDistribution\DeliveryOptimization\Cache' })
$categories.Add([pscustomobject]@{ id = 'error_reports'; sizeBytes = Get-FolderSize 'C:\ProgramData\Microsoft\Windows\WER' })

$chromeCache = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Default\Cache'
$categories.Add([pscustomobject]@{ id = 'chrome_cache'; sizeBytes = Get-FolderSize $chromeCache })

$edgeCache = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\Default\Cache'
$categories.Add([pscustomobject]@{ id = 'edge_cache'; sizeBytes = Get-FolderSize $edgeCache })

ConvertTo-Json -InputObject $categories -Compress -Depth 3
