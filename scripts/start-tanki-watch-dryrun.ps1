param(
  [string]$GuildId = "1499090620373929984",
  [string]$ApiUrl = "https://mjs-tengoku2-a8a007d5.koyeb.app/api/matches",
  [string]$LogPath
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$secureKey = Read-Host "Enter EXTERNAL_API_KEY" -AsSecureString
$keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:EXTERNAL_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr)
}

$env:TANKI_API_URL = $ApiUrl
$env:TANKI_GUILD_ID = $GuildId
$env:TANKI_DRY_RUN = "true"
$env:TANKI_LOCAL_ONLY = "false"
$env:TANKI_ALLOW_PLACEHOLDER_PLAYERS = "false"
$env:TANKI_READ_EXISTING = "false"
$env:TANKI_AUTO_FOLLOW_LATEST_LOG = "true"

if ($LogPath) {
  $env:TANKI_LOG_PATH = $LogPath
  Write-Host "Log path: $LogPath"
} else {
  Remove-Item Env:TANKI_LOG_PATH -ErrorAction SilentlyContinue
  Write-Host "Log path: auto-follow"
}

Write-Host "Mode: dryRun"
Set-Location $repoRoot
scripts\with-node22.cmd run tanki:watch
