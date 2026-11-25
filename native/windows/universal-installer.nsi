; SmartMaktab universal setup: auto-selects 64-bit or 32-bit installer by Windows bitness.
; Build (Windows): makensis /DX64_EXE=... /DIA32_EXE=... /DOUT_FILE=... universal-installer.nsi
Unicode True
!include LogicLib.nsh
!include FileFunc.nsh
!ifndef X64_EXE
  !define X64_EXE "x64.exe"
!endif
!ifndef IA32_EXE
  !define IA32_EXE "ia32.exe"
!endif
!ifndef OUT_FILE
  !define OUT_FILE "SmartMaktab-Setup.exe"
!endif
Name "SmartMaktab"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\SmartMaktabSetup"
RequestExecutionLevel user
SilentInstall silent
SetCompressor /SOLID lzma
Section "SmartMaktab"
  CreateDirectory "$TEMP\SmartMaktabSetup"
  SetOutPath "$TEMP\SmartMaktabSetup"
  File "${X64_EXE}"
  File "${IA32_EXE}"
  ${If} ${RunningX64}
    ExecWait '"$TEMP\SmartMaktabSetup\x64.exe"'
  ${Else}
    ExecWait '"$TEMP\SmartMaktabSetup\ia32.exe"'
  ${EndIf}
  RMDir /r "$TEMP\SmartMaktabSetup"
SectionEnd
