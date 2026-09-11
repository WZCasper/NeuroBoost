<#
  purge-standby-list.ps1
  Frees the Windows "standby list" (cached, reclaimable file-backed memory
  pages) so it is immediately reusable, without any paid third-party tool.

  This uses the same technique as the open-source "EmptyStandbyList" utility:
  it P/Invokes the documented-by-convention ntdll.dll export
  NtSetSystemInformation with SystemInformationClass = 80
  (SystemMemoryListInformation) and command = 4 (MemoryPurgeStandbyList),
  after enabling SeProfileSingleProcessPrivilege on the current process
  token. Must run elevated (Administrator).

  This only touches the standby cache — it does not close applications,
  does not touch pagefile settings, and cannot cause data loss.
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

    public static bool EnablePrivilege(string privilege)
    {
        IntPtr hToken;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out hToken))
            return false;

        LUID luid;
        if (!LookupPrivilegeValue(null, privilege, out luid))
            return false;

        TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
        tp.PrivilegeCount = 1;
        tp.Luid = luid;
        tp.Attributes = SE_PRIVILEGE_ENABLED;

        return AdjustTokenPrivileges(hToken, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
    }
}
'@

try {
  Add-Type -TypeDefinition $signature -ErrorAction Stop

  $SystemMemoryListInformation = 80
  $MemoryPurgeStandbyList = 4

  if (-not [NeuroBoostMemory]::EnablePrivilege('SeProfileSingleProcessPrivilege')) {
    Write-Error 'Could not enable SeProfileSingleProcessPrivilege. Run NeuroBoost as Administrator.'
    exit 1
  }

  $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(4)
  try {
    [System.Runtime.InteropServices.Marshal]::WriteInt32($ptr, $MemoryPurgeStandbyList)
    $status = [NeuroBoostMemory]::NtSetSystemInformation($SystemMemoryListInformation, $ptr, 4)
    if ($status -ne 0) {
      Write-Error ("NtSetSystemInformation returned status 0x{0:X8}" -f $status)
      exit 1
    }
  }
  finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
  }

  Write-Output 'OK'
  exit 0
}
catch {
  Write-Error "Failed to purge standby list: $($_.Exception.Message)"
  exit 1
}
