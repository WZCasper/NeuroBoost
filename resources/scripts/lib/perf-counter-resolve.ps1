<#
  perf-counter-resolve.ps1
  Resolves an English Windows performance-counter path (e.g.
  "\Processor(_Total)\% Processor Time") to the current system locale, so
  Get-Counter can find it on any language of Windows.

  Get-Counter itself only accepts localized paths - there is no PowerShell
  equivalent of the Win32 PdhAddEnglishCounter function. The documented
  workaround (Microsoft Learn, "Retrieving Counter Names and Help Text") is
  to read both the always-English name table (Perflib\009) and the
  current-language one (Perflib\CurrentLanguage): both list "index,name"
  pairs in the same order, so matching by index translates an English name
  to whatever the running system actually calls it.
#>

function Get-PerfCounterNameMaps {
  $base = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Perflib'
  $english = (Get-ItemProperty -Path (Join-Path $base '009') -Name Counter -ErrorAction Stop).Counter
  $local = (Get-ItemProperty -Path (Join-Path $base 'CurrentLanguage') -Name Counter -ErrorAction Stop).Counter

  $englishToIndex = @{}
  for ($i = 0; $i -lt $english.Count - 1; $i += 2) {
    $englishToIndex[$english[$i + 1]] = $english[$i]
  }
  $indexToLocal = @{}
  for ($i = 0; $i -lt $local.Count - 1; $i += 2) {
    $indexToLocal[$local[$i]] = $local[$i + 1]
  }
  return @{ EnglishToIndex = $englishToIndex; IndexToLocal = $indexToLocal }
}

function Resolve-EnglishCounterPath {
  param(
    [Parameter(Mandatory = $true)][string]$EnglishPath,
    [Parameter(Mandatory = $true)][hashtable]$Maps
  )
  $result = $EnglishPath
  $names = $Maps.EnglishToIndex.Keys | Sort-Object Length -Descending
  foreach ($name in $names) {
    if ($result -notlike "*$name*") { continue }
    $idx = $Maps.EnglishToIndex[$name]
    if ($Maps.IndexToLocal.ContainsKey($idx)) {
      $literalReplacement = $Maps.IndexToLocal[$idx] -replace '\$', '$$$$'
      $result = $result -replace [regex]::Escape($name), $literalReplacement
    }
  }
  return $result
}

function Get-CounterSampleEnglish {
  param(
    [Parameter(Mandatory = $true)][string[]]$EnglishPaths,
    [int]$SampleIntervalSeconds = 1,
    [int]$MaxSamples = 1
  )
  try {
    $maps = Get-PerfCounterNameMaps
    $resolved = $EnglishPaths | ForEach-Object { Resolve-EnglishCounterPath -EnglishPath $_ -Maps $maps }
    return Get-Counter -Counter $resolved -SampleInterval $SampleIntervalSeconds -MaxSamples $MaxSamples -ErrorAction Stop
  } catch {
    return $null
  }
}
