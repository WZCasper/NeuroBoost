<#
  get-hardware-temps.ps1
  Reads CPU and GPU temperature sensors via LibreHardwareMonitorLib (MPL 2.0;
  see resources/bin/SOURCES.md for where the bundled DLL came from and its
  SHA-256). Returns a result even when PawnIO is not installed or temperature
  reading otherwise fails - this is always an optional enhancement on top of
  get-hardware-info.ps1, never something the rest of the app depends on.

  CRITICAL: every type below is loaded via [System.Type]::GetType(...) with
  reflection, NEVER a direct [Namespace.Type] literal. A literal type
  reference is resolved by PowerShell's parser while the whole script is
  being COMPILED, before any try/catch around it ever runs - on a machine
  without the native GDI+-style library this depends on, a script that
  merely MENTIONS such a type as a literal fails to even dot-source, with
  no code in it ever running. Verified directly during development: a
  script mentioning [System.Drawing.Imaging.ImageFormat] as a literal
  crashed on load on this Linux container; the identical logic through
  GetType() loads fine and only fails - catchably - at the actual point of
  use. The equivalent risk applies to LibreHardwareMonitor's own types here,
  so the same pattern is used throughout.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Get-HardwareTypes {
  $dllPath = Join-Path $PSScriptRoot '..\bin\LibreHardwareMonitorLib.dll'
  $hidSharpPath = Join-Path $PSScriptRoot '..\bin\HidSharp.dll'
  if (-not (Test-Path -LiteralPath $dllPath) -or -not (Test-Path -LiteralPath $hidSharpPath)) { return $null }

  try {
    # Unblock-File itself can throw on some platforms/configurations rather
    # than just no-op (observed directly: PlatformNotSupportedException on
    # non-Windows PowerShell) even with -ErrorAction SilentlyContinue for
    # its OWN terminating errors - wrapped separately so a failure here
    # specifically never masks whether Add-Type itself actually worked.
    try { Unblock-File -LiteralPath $dllPath -ErrorAction Stop } catch { }
    try { Unblock-File -LiteralPath $hidSharpPath -ErrorAction Stop } catch { }
    Add-Type -Path $hidSharpPath -ErrorAction Stop
    Add-Type -Path $dllPath -ErrorAction Stop

    $computerType = [System.Type]::GetType('LibreHardwareMonitor.Hardware.Computer, LibreHardwareMonitorLib')
    if (-not $computerType) { return $null }
    return @{ Computer = $computerType }
  } catch {
    return $null
  }
}

$script:HwTypes = Get-HardwareTypes

function Write-Result {
  param($Obj)
  $Obj | ConvertTo-Json -Compress -Depth 4
}

if (-not $script:HwTypes) {
  Write-Result @{ available = $false; reason = 'missing-dll' }
  exit 0
}

try {
  $computer = [System.Activator]::CreateInstance($script:HwTypes.Computer)
  $computer.IsCpuEnabled = $true
  $computer.IsGpuEnabled = $true
  $computer.IsMotherboardEnabled = $true
  $computer.Open()

  try {
    $cpuTemps = New-Object System.Collections.Generic.List[double]
    $gpuTemps = New-Object System.Collections.Generic.List[double]
    $boardTemps = New-Object System.Collections.Generic.List[double]

    foreach ($hardware in $computer.Hardware) {
      $hardware.Update()
      foreach ($subHardware in $hardware.SubHardware) { $subHardware.Update() }

      $targetList = switch ($hardware.HardwareType.ToString()) {
        'Cpu' { $cpuTemps }
        { $_ -in @('GpuNvidia', 'GpuAmd', 'GpuIntel') } { $gpuTemps }
        'Motherboard' { $boardTemps }
        default { $null }
      }
      if ($null -eq $targetList) { continue }

      foreach ($sensor in $hardware.Sensors) {
        if ($sensor.SensorType.ToString() -eq 'Temperature' -and $null -ne $sensor.Value) {
          $targetList.Add([double]$sensor.Value)
        }
      }
    }

    $result = @{
      available  = $true
      cpuTempC   = if ($cpuTemps.Count -gt 0) { [math]::Round(($cpuTemps | Measure-Object -Maximum).Maximum, 1) } else { $null }
      gpuTempC   = if ($gpuTemps.Count -gt 0) { [math]::Round(($gpuTemps | Measure-Object -Maximum).Maximum, 1) } else { $null }
      boardTempC = if ($boardTemps.Count -gt 0) { [math]::Round(($boardTemps | Measure-Object -Maximum).Maximum, 1) } else { $null }
    }
    Write-Result $result
  }
  finally {
    $computer.Close()
  }
}
catch {
  Write-Result @{ available = $false; reason = 'error'; message = $_.Exception.Message }
}
