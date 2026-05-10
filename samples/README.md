# TANKI Sample Handling

Do not commit TANKI source files, package files, raw logs, screenshots, or extracted raw data.

Use local-only folders:

- `samples/private/` for original local files
- `samples/sanitized/` for generated summaries or redacted outputs

Both folders are ignored by Git.

Generate a shareable structural summary:

```bat
scripts\with-node22.cmd exec -- tsx scripts\sanitize-tanki-sample.ts samples\private\sample.json --mode summary
```

Use `--mode redacted` only for local review. It may preserve original field names, so do not share it unless you have manually checked that no licensed/internal structure remains.
