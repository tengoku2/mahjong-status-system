param(
  [string]$GuildId = "1499090620373929984",
  [string]$LogPath
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$env:TANKI_GUILD_ID = $GuildId
$env:TANKI_DRY_RUN = "true"
$env:TANKI_LOCAL_ONLY = "true"
$env:TANKI_ALLOW_PLACEHOLDER_PLAYERS = "true"
$env:TANKI_READ_EXISTING = "true"
$env:TANKI_AUTO_FOLLOW_LATEST_LOG = "true"

if ($LogPath) {
  $env:TANKI_LOG_PATH = $LogPath
  Write-Host "Log path: $LogPath"
} else {
  Remove-Item Env:TANKI_LOG_PATH -ErrorAction SilentlyContinue
  Write-Host "Log path: auto-follow"
}

Write-Host "Mode: localOnly"
Set-Location $repoRoot
scripts\with-node22.cmd run tanki:watch
