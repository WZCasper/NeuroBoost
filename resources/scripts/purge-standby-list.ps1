<#
  purge-standby-list.ps1
  Two real, documented Windows actions - not a simulation:

  1) Purges the standby list (cached, reclaimable file-backed memory pages)
     via NtSetSystemInformation(SystemMemoryListInformation=80,
     MemoryPurgeStandbyList=4) after enabling SeProfileSingleProcessPrivilege
     on the current token - the same technique used by the open-source
     "EmptyStandbyList" utility. Requires an elevated process.

  2) Trims the working set of eligible running processes via the documented
     psapi.dll EmptyWorkingSet function - this is the part that actually
     moves the "used memory" number, since Windows already counts standby
     pages as "available". Any page a process still needs gets paged back
     in automatically on next access - this cannot cause data loss.

  Neither action closes an application, touches the pagefile, or deletes
  any file.

  OUTPUT FORMAT: one compact JSON object per line, written as work happens
  (not buffered until the end), so the caller can show live progress:
    {"event":"standby","status":"purged"}       - once, near the start
    {"event":"trim","name":"chrome"}             - once per process trimmed
    {"event":"summary","standbyPurged":true,...} - once, the final line
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$signature = @'
using System;
using System.Runtime.InteropServices;

public static class NeuroBoostMemory
{
    [DllImport("ntdll.dll")]
    public static extern uint NtSetSystemInformation(int SystemInformationClass, IntPtr SystemInformation, int SystemInformationLength);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out LUID lpLuid);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool AdjustTokenPrivileges(IntPtr TokenHandle, bool DisableAllPrivileges, ref TOKEN_PRIVILEGES NewState, uint BufferLength, IntPtr PreviousState, IntPtr ReturnLength);

    [DllImport("kernel32.dll")]
    public static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, int processId);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("psapi.dll", SetLastError = true)]
    public static extern bool EmptyWorkingSet(IntPtr hProcess);

    [StructLayout(LayoutKind.Sequential)]
    public struct LUID { public uint LowPart; public int HighPart; }

    [StructLayout(LayoutKind.Sequential)]
    public struct TOKEN_PRIVILEGES
    {
        public uint PrivilegeCount;
        public LUID Luid;
        public uint Attributes;
    }

    const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
    const uint TOKEN_QUERY = 0x0008;
    const uint SE_PRIVILEGE_ENABLED = 0x0002;

    const int ERROR_NOT_ALL_ASSIGNED = 1300;

    public static bool EnablePrivilege(string privilege)
    {
        IntPtr hToken = IntPtr.Zero;
        try
        {
            if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out hToken))
                return false;

            LUID luid;
            if (!LookupPrivilegeValue(null, privilege, out luid))
                return false;

            TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
            tp.PrivilegeCount = 1;
            tp.Luid = luid;
            tp.Attributes = SE_PRIVILEGE_ENABLED;

            if (!AdjustTokenPrivileges(hToken, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero))
                return false;

            // AdjustTokenPrivileges returns TRUE even when it could not assign
            // the privilege; the real outcome is in the last-error code. Without
            // this check a non-elevated run would report success and the purge
            // would then silently do nothing.
            return System.Runtime.InteropServices.Marshal.GetLastWin32Error() != ERROR_NOT_ALL_ASSIGNED;
        }
        finally
        {
            // The token handle used to be leaked on every call.
            if (hToken != IntPtr.Zero) CloseHandle(hToken);
        }
    }
}
'@

Add-Type -TypeDefinition $signature -ErrorAction Stop

# --- Part 1: purge the standby list --------------------------------------
$standbyPurged = $false
try {
  $SystemMemoryListInformation = 80
  $MemoryPurgeStandbyList = 4

  if ([NeuroBoostMemory]::EnablePrivilege('SeProfileSingleProcessPrivilege')) {
    $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(4)
    try {
      [System.Runtime.InteropServices.Marshal]::WriteInt32($ptr, $MemoryPurgeStandbyList)
      $status = [NeuroBoostMemory]::NtSetSystemInformation($SystemMemoryListInformation, $ptr, 4)
      if ($status -eq 0) { $standbyPurged = $true }
    }
    finally {
      [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
    }
  }
}
catch {
  $standbyPurged = $false
}

[pscustomobject]@{ event = 'standby'; status = $(if ($standbyPurged) { 'purged' } else { 'skipped' }) } |
  ConvertTo-Json -Compress
[Console]::Out.Flush()

# --- Part 2: trim working sets of eligible processes, reporting each one --
$PROCESS_SET_QUOTA = 0x0100
$PROCESS_QUERY_INFORMATION = 0x0400
$excludeNames = @('System', 'Idle', 'Registry', 'Secure System', 'Memory Compression', 'csrss', 'wininit', 'services', 'lsass', 'smss', 'winlogon', 'NeuroBoost')
$currentPid = $PID

$trimmedNames = New-Object System.Collections.Generic.List[string]

Get-Process | Where-Object {
  $_.Id -ne 0 -and
  $_.Id -ne $currentPid -and
  ($excludeNames -notcontains $_.ProcessName) -and
  $_.WorkingSet64 -gt 20MB
} | ForEach-Object {
  try {
    $handle = [NeuroBoostMemory]::OpenProcess($PROCESS_SET_QUOTA -bor $PROCESS_QUERY_INFORMATION, $false, $_.Id)
    if ($handle -ne [IntPtr]::Zero) {
      try {
        if ([NeuroBoostMemory]::EmptyWorkingSet($handle)) {
          $trimmedNames.Add($_.ProcessName)
          [pscustomobject]@{ event = 'trim'; name = $_.ProcessName } | ConvertTo-Json -Compress
          [Console]::Out.Flush()
        }
      }
      finally {
        [NeuroBoostMemory]::CloseHandle($handle) | Out-Null
      }
    }
  }
  catch {
    # Expected for protected/inaccessible processes - just skip them.
  }
}

$output = [pscustomobject]@{
  event         = 'summary'
  standbyPurged = $standbyPurged
  trimmedCount  = $trimmedNames.Count
  trimmedNames  = $trimmedNames
}

ConvertTo-Json -InputObject $output -Compress -Depth 3
