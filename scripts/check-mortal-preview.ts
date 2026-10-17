import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sha256, type PreviewManifest } from "../src/mortal-preview-bundle.js";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}
const base = new URL(argument("--base-url"));
assert(base.protocol === "https:" || (base.protocol === "http:" && base.hostname === "127.0.0.1"), "Use HTTPS outside localhost.");
const source = resolve(argument("--source"));
const manifest = JSON.parse(await readFile(resolve(source, "deploy-manifest.json"), "utf8")) as PreviewManifest;
const access = await readFile(resolve(".private/mortal-preview-access.txt"), "utf8");
const username = /^Username: (.+)$/m.exec(access)?.[1].trim();
const password = /^Password: (.+)$/m.exec(access)?.[1].trim();
assert(username && password, "Missing local preview credentials.");
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
const results: Array<Record<string, unknown>> = [];
for (const file of manifest.files) {
  const path = `/mortal-preview/${file.path}`;
  const url = new URL(path, base);
  const unauthenticated = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60000) });
  assert.equal(unauthenticated.status, 401, `Anonymous access must be rejected: ${path}`);
  await unauthenticated.arrayBuffer();
  const response = await fetch(url, { headers: { authorization }, redirect: "manual", signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, path);
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.length, file.bytes, path);
  assert.equal(sha256(body), file.sha256, path);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const head = await fetch(url, { method: "HEAD", headers: { authorization }, redirect: "manual", signal: AbortSignal.timeout(60000) });
  assert.equal(head.status, 200, path);
  // Koyeb's edge can omit Content-Length on HEAD even when the origin sends it.
  const headLength = head.headers.get("content-length");
  if (headLength !== null) assert.equal(headLength, String(file.bytes));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  results.push({ path, bytes: body.length, sha256: file.sha256, anonymous: 401, authenticated: 200, head: 200 });
}
const entry = await fetch(new URL("/mortal-preview/analysis/", base), { headers: { authorization }, signal: AbortSignal.timeout(60000) });
assert.equal(entry.status, 200);
assert.equal(sha256(Buffer.from(await entry.arrayBuffer())), manifest.files.find((f) => f.path === manifest.entrypoint)?.sha256);
for (const path of ["/health", "/health/db"]) {
  for (const method of ["GET", "HEAD"]) {
    const response = await fetch(new URL(path, base), { method, signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200, `${method} ${path}`);
    if (method === "GET") assert.equal((await response.json() as { ok: boolean }).ok, true);
    else assert.equal(await response.text(), "");
    results.push({ path, method, status: 200 });
  }
}
const matches = await fetch(new URL("/api/matches", base), { signal: AbortSignal.timeout(60000) });
assert.equal(matches.status, 405);
await matches.arrayBuffer();
const report = { checkedAt: new Date().toISOString(), baseUrl: base.origin, generationId: manifest.generation_id, results, matchApiGet: 405 };
await writeFile(resolve(".private/mortal-preview-verification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
