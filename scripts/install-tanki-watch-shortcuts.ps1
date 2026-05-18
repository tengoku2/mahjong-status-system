param(
  [string]$DesktopPath
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $DesktopPath) {
  $DesktopPath = [Environment]::GetFolderPath("Desktop")
}

if (-not (Test-Path -LiteralPath $DesktopPath)) {
  throw "Desktop path was not found: $DesktopPath"
}

$wsh = New-Object -ComObject WScript.Shell

$shortcuts = @(
  @{
    Name = "VRChat-TANKI-Check.lnk"
    Target = (Join-Path $repoRoot "scripts\start-tanki-watch-localonly.cmd")
    Description = "Start local TANKI result check."
  },
  @{
    Name = "VRChat-TANKI-API-Check.lnk"
    Target = (Join-Path $repoRoot "scripts\start-tanki-watch-dryrun.cmd")
    Description = "Start dryRun API check for TANKI results."
  },
  @{
    Name = "VRChat-TANKI-Register.lnk"
    Target = (Join-Path $repoRoot "scripts\start-tanki-watch-register.cmd")
    Description = "Start production registration for TANKI results."
  }
)

foreach ($item in $shortcuts) {
  if (-not (Test-Path -LiteralPath $item.Target)) {
    throw "Target script was not found: $($item.Target)"
  }

  $shortcutPath = Join-Path $DesktopPath $item.Name
  $shortcut = $wsh.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $item.Target
  $shortcut.WorkingDirectory = $repoRoot
  $shortcut.Description = $item.Description
  $shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,13"
  $shortcut.Save()

  Write-Host "Created: $shortcutPath"
}

Write-Host "Desktop shortcuts installed successfully."
