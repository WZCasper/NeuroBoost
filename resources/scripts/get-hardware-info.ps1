<#
  get-hardware-info.ps1
  Returns a single JSON object describing the machine: static identity
  (motherboard, GPU model, RAM modules) plus live load for CPU, GPU and RAM.
  No PSU section - a standard desktop PSU has no data connection to the
  motherboard, so Windows cannot report its model or wattage (confirmed:
  WMI does not implement CIM_PowerSupply at all). Temperatures are not
  collected here; see get-hardware-temps.ps1, which needs the optional
  LibreHardwareMonitor + PawnIO driver this script does not depend on.

  Every section is independently best-effort: one WMI class being
  unavailable, or one counter set not existing on this Windows version,
  never prevents the rest of the data from being returned.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\perf-counter-resolve.ps1')

function Get-Safe {
  param([scriptblock]$Block)
  try { & $Block } catch { $null }
}

$board = Get-Safe {
  $b = Get-CimInstance -ClassName Win32_BaseBoard -ErrorAction Stop | Select-Object -First 1
  if ($b) { [pscustomobject]@{ manufacturer = [string]$b.Manufacturer; product = [string]$b.Product } }
}

$gpus = Get-Safe {
  Get-CimInstance -ClassName Win32_VideoController -ErrorAction Stop | ForEach-Object {
    [pscustomobject]@{
      name   = [string]$_.Name
      vramMB = if ($_.AdapterRAM) { [math]::Round([int64]$_.AdapterRAM / 1MB) } else { $null }
    }
  }
}

$ramModules = Get-Safe {
  Get-CimInstance -ClassName Win32_PhysicalMemory -ErrorAction Stop | ForEach-Object {
    [pscustomobject]@{
      manufacturer = ([string]$_.Manufacturer).Trim()
      capacityGB   = [math]::Round([int64]$_.Capacity / 1GB, 1)
      speedMHz     = if ($_.Speed) { [int]$_.Speed } else { $null }
    }
  }
}

$cpuName = Get-Safe {
  (Get-CimInstance -ClassName Win32_Processor -ErrorAction Stop | Select-Object -First 1).Name -replace '\s+', ' '
}

$cpuLoadPercent = Get-Safe {
  $sample = Get-CounterSampleEnglish -EnglishPaths @('\Processor(_Total)\% Processor Time')
  if ($sample) { [math]::Round($sample.CounterSamples[0].CookedValue, 1) }
}

$ramUsedPercent = Get-Safe {
  $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
  $totalKB = [int64]$os.TotalVisibleMemorySize
  $freeKB = [int64]$os.FreePhysicalMemory
  if ($totalKB -gt 0) { [math]::Round((($totalKB - $freeKB) / $totalKB) * 100, 1) }
}

$gpuLoadPercent = Get-Safe {
  $sample = Get-CounterSampleEnglish -EnglishPaths @('\GPU Engine(*engtype_3D)\Utilization Percentage')
  if ($sample) {
    $sum = ($sample.CounterSamples | Measure-Object -Property CookedValue -Sum).Sum
    [math]::Round([math]::Min($sum, 100), 1)
  }
}

$gpuVramUsedMB = Get-Safe {
  $sample = Get-CounterSampleEnglish -EnglishPaths @('\GPU Process Memory(*)\Dedicated Usage')
  if ($sample) {
    $sum = ($sample.CounterSamples | Measure-Object -Property CookedValue -Sum).Sum
    [math]::Round($sum / 1MB)
  }
}

[pscustomobject]@{
  board   = $board
  cpu     = [pscustomobject]@{ name = $cpuName; loadPercent = $cpuLoadPercent }
  gpus    = $gpus
  gpuLoad = [pscustomobject]@{ loadPercent = $gpuLoadPercent; vramUsedMB = $gpuVramUsedMB }
  ram     = [pscustomobject]@{ modules = $ramModules; usedPercent = $ramUsedPercent }
} | ConvertTo-Json -Compress -Depth 4
