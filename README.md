# NeuroBoost

A safe, free, open-source system optimizer for Windows 10 and Windows 11:
System Debloater, Telemetry Blocker, RAM (standby list) Cleaner, a Process
Priority Manager ("Auto-Boost"), a Startup Manager and a Disk Cleaner. Built
with Electron + Tailwind CSS v4 + vanilla JavaScript, packaged with
`electron-builder` into a single NSIS `Setup.exe`.

## Features

| Tab | What it does |
| --- | --- |
| Overview | System summary: Windows edition/build, memory, elevation status |
| Apps | Lists AppX apps actually installed on this machine and removes the ones you select |
| Telemetry | Reduces Windows diagnostic data; every change is recorded so **Restore defaults** reverts exactly what was changed |
| Memory | Purges the standby list and trims process working sets, reporting real before/after numbers |
| Processes | Live process list, priority control (capped at `High`), graceful-then-forced termination, Auto-Boost |
| Startup | Enables/disables Run-key entries and Startup-folder shortcuts (same flag Task Manager uses) |
| Disk | Cleans temp files, update cache, error reports, recycle bin and browser caches (Chrome, Edge, Firefox, all profiles) |
| Settings | Language (ru/en), start with Windows, minimize to tray, Auto-Boost CPU threshold and custom app list |

Also: a system restore point is requested before risky changes (Windows
throttles these to one per 24 hours, and the app reports honestly when one
could not be created), a tray icon with minimize-to-tray, and a persistent
log (Settings shows how to open it).

## How it's put together

```
src/
  main/
    main.js               Electron main process, window + IPC wiring
    preload.js             contextBridge API exposed to the renderer
    lib/
      elevation.js          "am I running as Administrator?" check
      paths.js               dev vs. packaged path resolution for scripts
      powershell-runner.js   spawns powershell.exe safely (argv, not a shell string)
      os-detect.js            Windows 10 vs 11 + build number detection
      debloater.js            enumerates real installed AppX apps + safe removal
      telemetry.js             apply/restore telemetry changes (with backup journal)
      ram-cleaner.js           real standby-list purge + working-set trim + memory stats
      process-manager.js       process listing, priority control, Auto-Boost
      process-worker.js        long-lived PowerShell worker used for process polling
      startup-manager.js       startup entries (Run keys + Startup folders)
      disk-cleaner.js          temp/cache categories, scan + clean
      restore-point.js         best-effort System Restore checkpoint
      autostart.js             "start with Windows" via a scheduled task
      settings.js / logger.js  persisted settings, rotating log file
      pure.js                  Electron-free logic (unit-tested with plain Node)
  renderer/
    index.html / renderer.js / i18n.js / escape.js / input.css (→ styles.css via Tailwind CLI)
    fonts/                  Inter + JetBrains Mono, bundled locally (no CDN)
resources/
  scripts/                 the actual .ps1 files, called by the lib/ modules
.github/workflows/build.yml  builds the installer on GitHub's servers
```

**All strings in .ps1 files are plain ASCII on purpose.** Windows
PowerShell 5.1 (`powershell.exe`) reads script files without a UTF-8 BOM
using the system codepage, not UTF-8 — non-ASCII text (e.g. Cyrillic
labels) in a `.ps1` file can get corrupted into garbage and break the
parser. Russian labels live in `renderer.js` instead, keyed by a plain
ASCII string the script returns.

**Why Electron over Tauri:** you already have an HTML/Tailwind/vanilla-JS
frontend, so Electron reuses it directly. Tauri would mean rewriting all the
system-level logic in Rust for a smaller binary — not worth it unless the
install size becomes a real problem later.

**Why no `wmic`:** Microsoft has deprecated WMIC and removed it by default
starting with Windows 11 22H2+. Every process/priority command here uses
`Get-CimInstance` / .NET's `System.Diagnostics.Process` instead, so it keeps
working on current and future Windows builds.

**RAM cleaning is two real Windows API calls, not a simulation:**
1. Purges the standby list via `NtSetSystemInformation` (same technique as
   the open-source "EmptyStandbyList" tool).
2. Trims the working set (`EmptyWorkingSet`) of eligible running processes —
   this is the part that actually moves the "used memory" number, since
   Windows already counts standby pages as "available". The app reports the
   real before/after numbers and how many processes were actually trimmed.

**The app list is scanned live from this machine, not a fixed catalog:**
`list-appx.ps1` enumerates whatever is actually installed via
`Get-AppxPackage`, filtered by Windows' own `NonRemovable` flag plus a
denylist. Each app also gets a name-pattern-based recommendation (shown as
a red "настоятельно рекомендуется" for known ad-bundled/promo software, or
yellow "можно удалить" for Microsoft's own optional first-party apps) — this
is pattern matching against known bloatware names, not malware scanning or
usage tracking, and is presented to the user as such.

**Safety choices, on purpose:**
- Windows Update, Windows Security/Defender, and the firewall are never
  touched by any script here.
- The debloat safety check (`NonRemovable` / framework / resource / denylist)
  runs twice — once to build the list, and again inside `remove-appx.ps1`
  right before removal — so a stale or tampered id from the renderer can
  never remove something it shouldn't.
- Every telemetry change is recorded (previous value + whether the key even
  existed) before it's applied, and each change is applied independently
  (one blocked key can't abort the rest), so **Restore defaults** reverts
  exactly what was actually changed instead of a guessed "default".
- Process priority is capped at `High` — `RealTime` is deliberately excluded
  everywhere (UI, IPC, and the PowerShell `ValidateSet`) because it can
  starve input/audio drivers and hang the machine.
- Neither RAM action closes an application, touches the pagefile, or
  deletes a file — see the comments at the top of `purge-standby-list.ps1`.

## Design

The UI follows the dark glass / cyan-purple design you provided. Fonts
(Inter, JetBrains Mono) are bundled locally under `src/renderer/fonts/`
rather than loaded from Google Fonts, and icons are inline SVG — both so
the app never depends on a network fetch or a remote script just to render
its own UI, matching the offline-capable, no-CDN approach used everywhere
else in this app.

## Building the installer — no PC or terminal needed (recommended)

This repo includes `.github/workflows/build.yml`, which builds the Windows
installer on GitHub's own Windows servers. You only need a browser (the
GitHub mobile app works too):

1. Create a new repository on GitHub and upload this project's files to it
   (GitHub's web UI supports drag-and-drop / "Add file → Upload files" —
   no `git` command needed).
2. Open the **Actions** tab of the repository → you'll see the
   "Build NeuroBoost installer" workflow → click **Run workflow**.
3. Wait for the run to go green (a few minutes).
4. Open the repository's **Releases** page (right sidebar on the repo home
   page) → the latest release has `NeuroBoost-Setup-<version>.exe` attached as a
   download.
5. Copy that `.exe` to any Windows 10/11 PC and run it. Windows will show a
   UAC prompt (the app requires Administrator rights by design) — accept it,
   choose an install folder, and it installs like any normal app.

Every push to `main` builds and publishes a new release automatically. If a
build ever fails, `.ci/last-build.log` in the repository always has the full
log from the most recent run.

### Updates

An installed copy checks GitHub Releases at launch. Because NeuroBoost runs as
Administrator, **nothing is downloaded or installed without your
confirmation**: you are shown the new version and choose *Download*, and after
the download you choose whether to install and restart now. Downgrades and
installing-on-quit are disabled.

### Code signing (not set up yet)

The installer is currently **unsigned**. Update integrity relies on the
SHA-512 hash in `latest.yml`, which is published in the same release as the
installer - it detects corruption but cannot detect a compromised release.
Windows SmartScreen will also warn about an unsigned installer. Signing needs
a code-signing certificate, which this repository does not have; until one is
configured, only install builds you obtained from this repository's Releases
page.

## Building it yourself on a Windows PC (if/when you have terminal access)

Requires [Node.js 20+](https://nodejs.org) installed on a Windows 10/11 machine.

```powershell
# 1. Open PowerShell in the project folder, then install dependencies
npm install

# 2. Run it locally in development mode (opens the app window)
#    Right-click PowerShell/Terminal and "Run as administrator" first —
#    most actions need admin rights even in dev mode.
npm start

# 3. Build the installable Setup.exe
npm run dist
```

The finished installer is written to `dist\NeuroBoost-Setup-<version>.exe`.

## Tests

```
npm test                      # JavaScript unit tests (plain Node, no Electron needed)
Invoke-Pester -Path ./test    # PowerShell tests (Pester 5, Windows)
```

Both suites also run on GitHub's Windows machine for **every pull request**
(the *Tests* workflow), so a change shows green or red before it is merged.
That workflow only reads the code: it never builds, releases or pushes. The
installer build and the release happen only on `main`, and both steps refuse
to run on any other branch.

## Adding an app icon (optional)

Drop a 256×256 `icon.ico` at `build/icon.ico` — electron-builder picks it up
automatically by convention; no config change needed. Without it, the
installer just uses Electron's default icon.
