@echo off
set "NODE22=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.23.4-win-x64"
if exist "%NODE22%\node.exe" (
  set "PATH=%NODE22%;%PATH%"
) else (
  node -e "const [major, minor, patch] = process.versions.node.split('.').map(Number); const safe = major > 22 || (major === 22 && (minor > 23 || (minor === 23 && patch >= 4))); process.exit(safe ? 0 : 1)" >nul 2>&1
  if errorlevel 1 (
    echo Node.js 22.23.4 or a newer supported version is required.
    echo Install it with: winget upgrade --id OpenJS.NodeJS.22 --exact
    exit /b 1
  )
)
npm.cmd %*
