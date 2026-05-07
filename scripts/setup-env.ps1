param(
  [string]$ClientId,
  [string]$GuildIds,
  [string]$DatabaseUrl = "file:./dev.db"
)

$ErrorActionPreference = "Stop"

if (-not $ClientId) {
  $ClientId = Read-Host "Discord Client ID"
}

if (-not $GuildIds) {
  $GuildIds = Read-Host "Development Guild IDs comma-separated"
}

$secureToken = Read-Host "Discord Bot Token" -AsSecureString
$tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr)
}

$envContent = @"
DISCORD_TOKEN=$token
DISCORD_CLIENT_ID=$ClientId
DISCORD_GUILD_IDS=$GuildIds
DATABASE_URL="$DatabaseUrl"
"@

Set-Content -LiteralPath ".env" -Value $envContent -Encoding UTF8NoBOM
Write-Host ".env has been written."
