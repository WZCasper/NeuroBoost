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
    ; 1. "Start with Windows" entry, written via Electron's setLoginItemSettings
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "NeuroBoost"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Electron"

    ; 2. App data: settings.json, telemetry-backup.json, logs/
    RMDir /r "$APPDATA\neuroboost"
    RMDir /r "$APPDATA\NeuroBoost"
    RMDir /r "$LOCALAPPDATA\neuroboost-updater"

    ; 3. Any startup shortcuts the user disabled through NeuroBoost get put
    ;    back, so uninstalling never leaves a program permanently disabled
    ;    in a folder the user doesn't know about.
    ${If} ${FileExists} "$SMSTARTUP\_NeuroBoost_Disabled\*.*"
      CopyFiles /SILENT "$SMSTARTUP\_NeuroBoost_Disabled\*.lnk" "$SMSTARTUP"
      RMDir /r "$SMSTARTUP\_NeuroBoost_Disabled"
    ${EndIf}
    ${If} ${FileExists} "$SMPROGRAMS\..\..\Startup\_NeuroBoost_Disabled\*.*"
      CopyFiles /SILENT "$SMPROGRAMS\..\..\Startup\_NeuroBoost_Disabled\*.lnk" "$SMPROGRAMS\..\..\Startup"
      RMDir /r "$SMPROGRAMS\..\..\Startup\_NeuroBoost_Disabled"
    ${EndIf}
  ${endIf}
!macroend
