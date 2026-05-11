param(
  [string]$GuildId = "1499090620373929984",
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

$env:TANKI_GUILD_ID = $GuildId
$env:TANKI_DRY_RUN = "true"
$env:TANKI_LOCAL_ONLY = "true"
$env:TANKI_ALLOW_PLACEHOLDER_PLAYERS = "true"
$env:TANKI_READ_EXISTING = "true"
$env:TANKI_LOG_PATH = $LogPath

Write-Host "監視対象ログ: $LogPath"
Write-Host "モード: ローカル確認。APIには送信しません。"
Set-Location $repoRoot
scripts\with-node22.cmd run tanki:watch
