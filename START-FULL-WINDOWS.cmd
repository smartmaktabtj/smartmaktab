@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 scripts\preview.py --open
  goto done
)
where python >nul 2>nul
if not errorlevel 1 (
  python scripts\preview.py --open
  goto done
)
echo Full mode requires Python 3. Use START-WINDOWS.cmd for offline mode.
pause
exit /b 1
:done
if errorlevel 1 pause
