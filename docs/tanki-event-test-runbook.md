# TANKI Event Test Runbook

This runbook is for a same-day event test of the TANKI result ingestion path.

Do not distribute TANKI assets, prefabs, modified TANKI files, or internal code. This repository only contains the Discord Bot side and local watcher tooling.

## Goal

Confirm this path during the event:

```text
TANKI result log -> local watcher -> Koyeb API -> Discord Bot DB
```

## Before the Event

1. Confirm Koyeb is running.
   - Open `https://mjs-tengoku2-a8a007d5.koyeb.app/health`
   - Expected result: `ok`

2. Confirm the Discord server member mappings.
   - In Discord, run `/mjs members`
   - Confirm every expected participant has the correct VRC name.
   - If a mapping is missing or outdated, run `/mjs name`.

3. Start VRChat from Unity Build & Test.
   - Start the world first.
   - Start the watcher after VRChat has opened, so it picks the latest VRChat log file.

## Local-Only Check

Use this when you only want to confirm that the VRChat log is readable. This does not call the API.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-tanki-watch-localonly.ps1
```

Expected output after a test result:

```text
localOnly ...
{
  "type": "...",
  "players": [...]
}
```

## API Dry Run

Use this before registering real event matches. This calls the API but does not save to DB.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-tanki-watch-dryrun.ps1
```

When prompted, paste the `EXTERNAL_API_KEY`.

Expected output:

```text
sent dryRun ...
{"ok":true,...}
```

If you see `displayName is not registered in this guild`, update the Discord VRC name mapping and retry.

If you see an API 400 member-only error, at least one resolved Discord user is not a member of the target server.

## Register Mode

Use this only after dryRun succeeds with the real players.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-tanki-watch-register.ps1
```

The script asks you to type `REGISTER` before it can save matches.

Expected output:

```text
sent register ...
{"ok":true,"duplicate":false,...}
```

## After a Match

1. In Discord, confirm the result.
   - `/mjs log`
   - `/mjs stats`
   - `/mjs rank`

2. If a wrong match was registered, use:
   - `/mjs undo`
   - or `/mjs del match_id`

## Operational Notes

- Start the watcher after VRChat starts. VRChat creates a new output log on each launch.
- Keep the watcher window open during the event.
- If VRChat restarts, stop the watcher and start it again.
- Keep `dryRun` mode until at least one real-player result succeeds.
- The local watcher must run on the PC where VRChat is running.
