param(
  [string]$GuildId = "1499090620373929984",
  [string]$ApiUrl = "https://mjs-tengoku2-a8a007d5.koyeb.app/api/matches",
  [string]$LogPath
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $LogPath) {
  $logDir = Join-Path $env:USERPROFILE "AppData\LocalLow\VRChat\VRChat"
  $latestLog = Get-ChildItem -LiteralPath $logDir -Filter "*output_log*.txt" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $latestLog) {
    throw "VRChatのoutput_logが見つかりません: $logDir"
  }

  $LogPath = $latestLog.FullName
}

$answer = Read-Host "このモードはDBへ対局を登録します。続行する場合は REGISTER と入力してください"
if ($answer -ne "REGISTER") {
  Write-Host "キャンセルしました。"
  exit 0
}

$secureKey = Read-Host "EXTERNAL_API_KEYを入力してください" -AsSecureString
$keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:EXTERNAL_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr)
}

$env:TANKI_API_URL = $ApiUrl
$env:TANKI_GUILD_ID = $GuildId
$env:TANKI_DRY_RUN = "false"
$env:TANKI_LOCAL_ONLY = "false"
$env:TANKI_ALLOW_PLACEHOLDER_PLAYERS = "false"
$env:TANKI_READ_EXISTING = "false"
$env:TANKI_LOG_PATH = $LogPath

Write-Host "監視対象ログ: $LogPath"
Write-Host "モード: 本登録。対局結果をDBへ保存します。"
Set-Location $repoRoot
scripts\with-node22.cmd run tanki:watch
