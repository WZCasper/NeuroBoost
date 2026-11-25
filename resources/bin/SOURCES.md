# Third-party binaries in this folder

These are vendored (not npm/NuGet dependencies) because temperature
sensors require them to run under Windows PowerShell as Administrator, not
as a .NET project reference. Each one was downloaded directly from its
project's own GitHub Releases - never from a mirror or any other domain -
and its SHA-256 recorded here at the time it was added, so a future update
is a deliberate, verifiable change rather than silently trusting whatever a
URL happens to return.

## LibreHardwareMonitorLib.dll + HidSharp.dll

- Source: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/tag/v0.9.6
- Asset: LibreHardwareMonitor.zip (only these two DLLs are used out of it;
  the rest of the zip is the Windows Forms GUI app and its own dependencies,
  not needed to read sensors from a script)
- License: MPL 2.0
- SHA-256 (LibreHardwareMonitorLib.dll): 6ebc194316536ba61af5be24508ad9fcbb2ecc685e716c12e787c79530f66bf0
- SHA-256 (HidSharp.dll): d86690efde30ea9179f669320f39148853793b743a98b531afeaf30598e22f54

LibreHardwareMonitor's own README explicitly warns: "We're not affiliated
with librehardwaremonitor.com. For your safety, please avoid using that
site" - that domain impersonates the project (see GitHub issue #2296 on the
official repo). github.com/LibreHardwareMonitor/LibreHardwareMonitor is the
only trusted source.

## PawnIO_setup.exe

- Source: https://github.com/namazso/PawnIO.Setup/releases/tag/2.2.0
- Why PawnIO and not the older WinRing0 driver LibreHardwareMonitor used to
  ship: WinRing0.sys has a public CVE (CVE-2020-14979, a privilege
  escalation - any unprivileged local process could use an already-installed
  copy to talk to the driver directly), which is also why Windows Defender
  blocks it by default. PawnIO is a Microsoft-signed driver with no such
  CVE; LibreHardwareMonitorLib detects and uses it automatically starting
  with v0.9.5, no extra flag needed.
- License: GPL 2 with exception (the open-source edition); this installer
  ships namazso's own signed build, recommended by the PawnIO wiki as the
  one end users should install.
- Silent install command: `PawnIO_setup.exe -install -silent`
- SHA-256: 1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032

## Updating any of these

1. Download the new version from the project's own GitHub Releases page
   only (never a mirror).
2. Record its new SHA-256 here.
3. Update resources/scripts/get-hardware-temps.ps1 if the expected hash is
   checked there too, so a corrupted or substituted file is refused rather
   than silently loaded.
