; installer.nsh
; Custom uninstall cleanup for NeuroBoost.
;
; The default NSIS uninstaller only removes the app's own files. NeuroBoost
; also writes things *outside* its install folder - a Run key for "start
; with Windows", StartupApproved flags for any startup entries the user
; disabled through the app, and its settings/telemetry-backup/log files in
; %APPDATA%. For a tool whose whole promise is "everything is reversible",
; leaving those behind after uninstall would be exactly the wrong ending, so
; they're cleaned up here.
;
; Deliberately NOT undone automatically: telemetry registry values and
; removed AppX apps. Silently reverting real system changes during an
; uninstall (which often runs unattended) would be surprising and could
; re-enable telemetry a user deliberately turned off. The prompt below
; points them at "Restore defaults" instead, which is explicit and in-app.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; 1. Autostart scheduled task (see resources/scripts/set-autostart.ps1),
    ;    plus any legacy Run-key entry left by older versions.
    nsExec::ExecToLog 'schtasks /Delete /TN "NeuroBoostAutoStart" /F'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "NeuroBoost"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Electron"

    ; 2. App data: settings.json, telemetry-backup.json, logs/
    RMDir /r "$APPDATA\neuroboost"
    RMDir /r "$APPDATA\NeuroBoost"
    RMDir /r "$LOCALAPPDATA\neuroboost-updater"

    ; 3. Any startup shortcuts the user disabled through NeuroBoost get put
    ;    back, so uninstalling never leaves a program permanently disabled
    ;    in a folder the user doesn't know about.
    ;
    ; NeuroBoost is installed perMachine (package.json), so electron-builder
    ; always runs this uninstaller with SetShellVarContext all - $SMSTARTUP
    ; here is the all-users Startup folder, not the per-user one. The two
    ; blocks that used to be here both resolved to that SAME all-users path
    ; ($SMPROGRAMS\..\..\Startup is all-users too under this context), so
    ; the per-user Startup folder - which lib/startup-safety.ps1 equally
    ; allows toggle-startup.ps1 to disable shortcuts in - was never restored
    ; on uninstall. Handle each context explicitly instead of relying on two
    ; NSIS constants that happen to collide under one context.
    ${If} ${FileExists} "$SMSTARTUP\_NeuroBoost_Disabled\*.*"
      CopyFiles /SILENT "$SMSTARTUP\_NeuroBoost_Disabled\*.lnk" "$SMSTARTUP"
      RMDir /r "$SMSTARTUP\_NeuroBoost_Disabled"
    ${EndIf}
    SetShellVarContext current
    ${If} ${FileExists} "$SMSTARTUP\_NeuroBoost_Disabled\*.*"
      CopyFiles /SILENT "$SMSTARTUP\_NeuroBoost_Disabled\*.lnk" "$SMSTARTUP"
      RMDir /r "$SMSTARTUP\_NeuroBoost_Disabled"
    ${EndIf}
    SetShellVarContext all
  ${endIf}
!macroend
