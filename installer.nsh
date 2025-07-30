!macro customInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to run Gemini at system startup?" IDYES autoStart

  Goto skipAutoStart

  autoStart:
    WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "GeminiApp" "$INSTDIR\\GeminiApp.exe"

  skipAutoStart:
!macroend