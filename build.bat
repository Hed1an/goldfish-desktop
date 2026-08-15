@echo off
REM DeepSeek Harness Desktop - one-click build
REM Usage: double-click this file, or run: build.bat
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   DeepSeek Harness Desktop - one-click build
echo ============================================
echo.
echo [1/2] Installing dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed. Install Node.js >= 22 first.
  pause
  exit /b 1
)
echo.
echo [2/2] Building NSIS installer...
call npm run dist
if errorlevel 1 (
  echo [ERROR] build failed.
  pause
  exit /b 1
)
echo.
echo ============================================
echo   DONE! Installer is in the dist\ folder.
echo ============================================
pause
