import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse } from "dotenv";
import { openPreviewBundle, packPreviewBundle, sha256, type PreviewBundle, type PreviewManifest } from "../src/mortal-preview-bundle.js";

const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
if (sourceIndex < 0 || !args[sourceIndex + 1]) throw new Error("Usage: npm run mortal:prepare -- --source <snapshot-directory>");
const source = resolve(args[sourceIndex + 1]);
const credentialsPath = resolve(".private/mortal-preview.env");
const accessPath = resolve(".private/mortal-preview-access.txt");
const output = resolve(".private/mortal-preview.bundle.b64");
await mkdir(dirname(credentialsPath), { recursive: true });
await mkdir(dirname(output), { recursive: true });

let credentials: Record<string, string>;
try { credentials = parse(await readFile(credentialsPath)); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  const username = "mortal";
  const password = randomBytes(24).toString("base64url");
  credentials = {
    MORTAL_PREVIEW_AUTH_SHA256: sha256(`${username}:${password}`)
  };
  await writeFile(credentialsPath, Object.entries(credentials).map(([k, v]) => `${k}=${v}\n`).join(""), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await writeFile(accessPath, `Mortal private preview\nUsername: ${username}\nPassword: ${password}\nURL: https://mjs-tengoku2-a8a007d5.koyeb.app/mortal-preview/analysis/\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}
if (!/^[a-f0-9]{64}$/i.test(credentials.MORTAL_PREVIEW_AUTH_SHA256 ?? "")) throw new Error("Invalid preview credential hash.");
// Keep only the setting used by this deployment; never retain an obsolete key.
await writeFile(credentialsPath, `MORTAL_PREVIEW_AUTH_SHA256=${credentials.MORTAL_PREVIEW_AUTH_SHA256}\n`, { encoding: "utf8", mode: 0o600 });
const manifest = JSON.parse(await readFile(resolve(source, "deploy-manifest.json"), "utf8")) as PreviewManifest;
// Validate all manifest paths before reading anything outside the source directory.
if (!Array.isArray(manifest.files) || manifest.files.some((file) =>
  !(file.path === "analysis/index.html" || /^match_data\/(?:auto\/)?[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.html$/.test(file.path)))) {
  throw new Error("Invalid snapshot paths.");
}
const bundle: PreviewBundle = { manifest, files: {} };
for (const file of manifest.files) bundle.files[file.path] = await readFile(resolve(source, file.path), "utf8");
const encoded = packPreviewBundle(bundle);
const verified = openPreviewBundle(Buffer.from(encoded, "utf8"));
await writeFile(`${output}.tmp`, encoded, { encoding: "utf8", mode: 0o600 });
await rename(`${output}.tmp`, output);
console.log(JSON.stringify({ generationId: manifest.generation_id, files: verified.size, bytes: encoded.length, sha256: sha256(encoded), output, credentialsPath, accessPath }));
