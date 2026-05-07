@echo off
setlocal

set "CLIENT_ID=%~1"
set "GUILD_IDS=%~2"
set "DATABASE_URL=file:./dev.db"

if "%CLIENT_ID%"=="" (
  set /p CLIENT_ID=Discord Client ID: 
)

if "%GUILD_IDS%"=="" (
  set /p GUILD_IDS=Development Guild IDs comma-separated: 
)

set /p DISCORD_TOKEN=Discord Bot Token: 

(
  echo DISCORD_TOKEN=%DISCORD_TOKEN%
  echo DISCORD_CLIENT_ID=%CLIENT_ID%
  echo DISCORD_GUILD_IDS=%GUILD_IDS%
  echo DATABASE_URL="file:./dev.db"
) > .env

echo .env has been written.
endlocal
