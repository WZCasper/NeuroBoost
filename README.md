# NeuroBoost

A safe, free, open-source system optimizer for Windows 10 and Windows 11:
System Debloater, Telemetry Blocker, RAM (standby list) Cleaner, and a
Process Priority Manager ("Auto-Boost"). Built with Electron + Tailwind CSS
v4 + vanilla JavaScript, packaged with `electron-builder` into a single
NSIS `Setup.exe`.

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
      debloater.js            server-side whitelist + AppX removal
      telemetry.js             apply/restore telemetry changes (with backup journal)
      ram-cleaner.js           standby-list purge + memory stats
      process-manager.js       process listing, priority control, Auto-Boost
  renderer/
    index.html / renderer.js / input.css (→ styles.css via Tailwind CLI)
resources/
  scripts/                 the actual .ps1 files, called by the lib/ modules
.github/workflows/build.yml  builds the installer on GitHub's servers
```

**Why Electron over Tauri:** you already have an HTML/Tailwind/vanilla-JS
frontend, so Electron reuses it directly. Tauri would mean rewriting all the
system-level logic in Rust for a smaller binary — not worth it unless the
install size becomes a real problem later.

**Why no `wmic`:** Microsoft has deprecated WMIC and removed it by default
starting with Windows 11 22H2+. Every process/priority command here uses
`Get-CimInstance` / .NET's `System.Diagnostics.Process` instead, so it keeps
working on current and future Windows builds.

**Safety choices, on purpose:**
- Windows Update, Windows Security/Defender, and the firewall are never
  touched by any script here.
- The debloat list is a server-side whitelist (`lib/debloater.js`) — the UI
  can only ever send an `id`, never a raw package name, so there's no way to
  inject an arbitrary removal target.
- Every telemetry change is recorded (previous value + whether the key even
  existed) before it's applied, so **Restore defaults** reverts to the exact
  prior state instead of a guessed "default".
- Process priority is capped at `High` — `RealTime` is deliberately excluded
  everywhere (UI, IPC, and the PowerShell `ValidateSet`) because it can
  starve input/audio drivers and hang the machine.
- The standby-list purge only touches the memory cache; it can't cause data
  loss and doesn't touch the pagefile.

## The frontend included here is a placeholder

You said the real UI already exists — I don't have those files yet. What's
in `src/renderer/` right now is a complete, fully wired reference
implementation (every button/toggle/table is connected to real backend
logic) so the app is usable today. To get your exact UI running instead:
send me the real `index.html` / CSS / JS (or a repo link I can pull from),
and I'll wire your markup to the same `window.neuroboost` API used by
`renderer.js` — nothing on the backend needs to change.

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
   page) → the latest release has `NeuroBoost-Setup-1.0.0.exe` attached as a
   download.
5. Copy that `.exe` to any Windows 10/11 PC and run it. Windows will show a
   UAC prompt (the app requires Administrator rights by design) — accept it,
   choose an install folder, and it installs like any normal app.

Every push to `main` builds and publishes a new release automatically. If a
build ever fails, `.ci/last-build.log` in the repository always has the full
log from the most recent run.

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

The finished installer is written to `dist\NeuroBoost-Setup-1.0.0.exe`.

## Adding an app icon (optional)

Drop a 256×256 `icon.ico` at `build/icon.ico` — electron-builder picks it up
automatically by convention; no config change needed. Without it, the
installer just uses Electron's default icon.
