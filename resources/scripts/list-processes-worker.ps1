<#
  list-processes-worker.ps1
  A long-lived worker instead of spawning a fresh powershell.exe on every
  poll: Auto-Boost polls every few seconds indefinitely, and starting a new
  PowerShell process each time is real, avoidable overhead for a tool whose
  whole point is system performance. This process stays alive and answers
  one JSON command per stdin line with one JSON response per stdout line.

  Protocol: {"cmd":"list","id":N} -> {"id":N,"ok":true,"data":[...]}
            {"cmd":"ping","id":N} -> {"id":N,"ok":true,"data":"pong"}
  Unknown/malformed input gets an {"ok":false,"error":...} response rather
  than crashing the worker.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$core = [Math]::Max([Environment]::ProcessorCount, 1)

function Get-ProcessListSnapshot {
  function Snapshot {
    Get-Process | ForEach-Object {
      try {
        [pscustomobject]@{
          Id = $_.Id
          Name = $_.ProcessName
          Cpu = $_.TotalProcessorTime
          Mem = $_.WorkingSet64
          Priority = $(try { $_.PriorityClass.ToString() } catch { $null })
          Path = $(try { $_.Path } catch { $null })
        }
      } catch { $null }
    } | Where-Object { $_ -ne $null }
  }

  $first = Snapshot
  Start-Sleep -Milliseconds 400
  $second = Snapshot

  $firstById = @{}
  foreach ($p in $first) { $firstById[$p.Id] = $p }

  foreach ($p in $second) {
    $prev = $firstById[$p.Id]
    if (-not $prev) { continue }
    $deltaMs = 0
    try { $deltaMs = ($p.Cpu - $prev.Cpu).TotalMilliseconds } catch { $deltaMs = 0 }
    $cpuPercent = if ($deltaMs -gt 0) { [Math]::Round(($deltaMs / 400.0) / $core * 100, 1) } else { 0 }
    [pscustomobject]@{
      pid = $p.Id
      name = $p.Name
      cpuPercent = $cpuPercent
      workingSetMB = [Math]::Round($p.Mem / 1MB, 1)
      priority = $p.Priority
      path = $p.Path
    }
  }
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break } # stdin closed - parent is shutting us down
  if ([string]::IsNullOrWhiteSpace($line)) { continue }

  $reqId = $null
  try {
    $req = $line | ConvertFrom-Json
    $reqId = $req.id
    if ($req.cmd -eq 'list') {
      $data = @(Get-ProcessListSnapshot)
      $resp = [pscustomobject]@{ id = $reqId; ok = $true; data = $data }
    }
    elseif ($req.cmd -eq 'ping') {
      $resp = [pscustomobject]@{ id = $reqId; ok = $true; data = 'pong' }
    }
    else {
      $resp = [pscustomobject]@{ id = $reqId; ok = $false; error = "Unknown command: $($req.cmd)" }
    }
  }
  catch {
    $resp = [pscustomobject]@{ id = $reqId; ok = $false; error = $_.Exception.Message }
  }

  ConvertTo-Json -InputObject $resp -Compress -Depth 4
  [Console]::Out.Flush()
}
