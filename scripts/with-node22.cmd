@echo off
set "NODE22=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.22.2-win-x64"
if not exist "%NODE22%\node.exe" (
  echo Node.js 22 was not found at "%NODE22%".
  echo Install it with: winget install OpenJS.NodeJS.22
  exit /b 1
)
set "PATH=%NODE22%;%PATH%"
npm.cmd %*
