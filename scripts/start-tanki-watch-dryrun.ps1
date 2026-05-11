param(
  [string]$GuildId = "1499090620373929984",
  [string]$ApiUrl = "https://mjs-tengoku2-a8a007d5.koyeb.app/api/matches",
  [string]$LogPath
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $LogPath) {
  $logDir = Join-Path $env:USERPROFILE "AppData\LocalLow\VRChat\VRChat"
  $latestLog = Get-ChildItem -LiteralPath $logDir -Filter "*output_log*.txt" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $latestLog) {
    throw "VRChat output_log was not found in $logDir"
  }

  $LogPath = $latestLog.FullName
}

$secureKey = Read-Host "EXTERNAL_API_KEY" -AsSecureString
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
$env:TANKI_LOG_PATH = $LogPath

Write-Host "Watching: $LogPath"
Write-Host "Mode: dryRun. DB registration will not happen."
Set-Location $repoRoot
scripts\with-node22.cmd run tanki:watch
