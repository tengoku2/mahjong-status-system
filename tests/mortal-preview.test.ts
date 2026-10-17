import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Client } from "discord.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiServer } from "../src/external-api.js";
import { openPreviewBundle, packPreviewBundle, sha256, type PreviewBundle } from "../src/mortal-preview-bundle.js";
import type { MortalPreviewOptions } from "../src/mortal-preview.js";

const authSha256 = sha256("mortal:test-password");
const authorization = `Basic ${Buffer.from("mortal:test-password").toString("base64")}`;
const reviewPath = "match_data/auto/sample-4.1b.html";
const html = Buffer.from('<!doctype html><meta charset="utf-8"><h1>練習ノート</h1><a href="../match_data/auto/sample-4.1b.html#kyoku-1-0">検討</a>');
const review = Buffer.from('<!doctype html><h2 id="kyoku-1-0">東一局</h2>');
const bundle: PreviewBundle = {
  manifest: {
    generation_id: "34".repeat(32), view_version: "1.1.0", analysis_version: "1.0.0", entrypoint: "analysis/index.html",
    files: [
      { path: "analysis/index.html", bytes: html.length, sha256: sha256(html) },
      { path: reviewPath, bytes: review.length, sha256: sha256(review) }
    ]
  },
  files: { "analysis/index.html": html.toString("utf8"), [reviewPath]: review.toString("utf8") }
};

let directory: string;
let bundlePath: string;
const servers: ReturnType<typeof createApiServer>[] = [];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "mjs-mortal-test-"));
  bundlePath = join(directory, "preview.bundle.b64");
  await writeFile(bundlePath, packPreviewBundle(bundle), "utf8");
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
  await rm(directory, { recursive: true, force: true });
});

async function start(options: MortalPreviewOptions = { authSha256, bundlePath }) {
  const client = { isReady: () => true } as unknown as Client;
  const server = createApiServer(client, async () => {}, options);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("private Mortal preview", () => {
  it.each(["", "/", "/analysis/", "/analysis/index.html", `/${reviewPath}`, "/deploy-manifest.json"])(
    "protects every preview path before revealing its existence: %s", async (path) => {
      const base = await start();
      const response = await fetch(`${base}/mortal-preview${path}`);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Basic");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.text()).not.toContain("練習ノート");
    }
  );

  it("rejects wrong and malformed credentials for GET and HEAD", async () => {
    const base = await start();
    for (const method of ["GET", "HEAD"]) {
      for (const bad of ["Bearer test-password", "Basic !!!!", `Basic ${Buffer.from("mortal:wrong").toString("base64")}`]) {
        const response = await fetch(`${base}/mortal-preview/analysis/`, { method, headers: { authorization: bad } });
        expect(response.status).toBe(401);
        if (method === "HEAD") expect(await response.text()).toBe("");
      }
    }
  });

  it("serves unchanged entry and review bytes, including HEAD, and restricts outgoing requests", async () => {
    const base = await start();
    for (const [path, bytes] of [["analysis/", html], ["analysis/index.html", html], [reviewPath, review]] as const) {
      const url = `${base}/mortal-preview/${path}`;
      const response = await fetch(url, { headers: { authorization } });
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(response.headers.get("content-length")).toBe(String(bytes.length));
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("content-security-policy")).toContain("frame-src 'none'");
      expect(response.headers.get("content-security-policy")).not.toContain("a.ekyu.moe");
      const head = await fetch(url, { method: "HEAD", headers: { authorization } });
      expect(head.status).toBe(200);
      expect(head.headers.get("content-length")).toBe(String(bytes.length));
      expect(await head.text()).toBe("");
    }
  });

  it("redirects authenticated entry aliases and refuses other files and methods", async () => {
    const base = await start();
    for (const path of ["", "/", "/analysis"]) {
      const response = await fetch(`${base}/mortal-preview${path}`, { redirect: "manual", headers: { authorization } });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/mortal-preview/analysis/");
    }
    for (const path of ["deploy-manifest.json", "mortal-preview.enc", "%2e%2e%2f.env", "analysis/%", "match_data/unknown.html"]) {
      expect((await fetch(`${base}/mortal-preview/${path}`, { headers: { authorization } })).status).toBe(404);
    }
    const response = await fetch(`${base}/mortal-preview/analysis/`, { method: "POST", headers: { authorization } });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  it("fails closed with missing configuration without affecting health or the match API", async () => {
    const base = await start({});
    expect((await fetch(`${base}/mortal-preview/analysis/`)).status).toBe(503);
    for (const path of ["/", "/health", "/health/db"]) {
      for (const method of ["GET", "HEAD"]) expect((await fetch(`${base}${path}`, { method })).status).toBe(200);
    }
    expect((await fetch(`${base}/api/matches`)).status).toBe(405);
    const response = await fetch(`${base}/api/matches`, { method: "POST" });
    expect([401, 503]).toContain(response.status);
  });

  it.each(["missing", "tampered"])("keeps existing service healthy when the bundle is %s", async (failure) => {
    let options = { authSha256, bundlePath };
    if (failure === "missing") options.bundlePath = join(directory, "missing.enc");
    if (failure === "tampered") {
      await writeFile(bundlePath, "invalid bundle", "utf8");
    }
    const base = await start(options);
    const response = await fetch(`${base}/mortal-preview/analysis/`, { headers: { authorization } });
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Preview unavailable.");
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("loads the same private config snapshot across independent server starts", async () => {
    for (let i = 0; i < 2; i++) {
      const base = await start();
      const response = await fetch(`${base}/mortal-preview/analysis/`, { headers: { authorization } });
      expect(sha256(Buffer.from(await response.arrayBuffer()))).toBe(sha256(html));
    }
  });
});

describe("private preview integrity", () => {
  it("rejects changed HTML, hidden files, duplicate paths and unsafe paths before packaging", () => {
    const changed = structuredClone(bundle);
    changed.files["analysis/index.html"] = "changed";
    expect(() => packPreviewBundle(changed)).toThrow("checksum");
    const extra = structuredClone(bundle);
    extra.files["secret.json"] = "e30=";
    expect(() => packPreviewBundle(extra)).toThrow("Unexpected");
    for (const path of ["../.env", "/absolute.html", "match_data/../.env"]) {
      const unsafe = structuredClone(bundle);
      unsafe.manifest.files[1].path = path;
      expect(() => packPreviewBundle(unsafe)).toThrow();
    }
    const duplicate = structuredClone(bundle);
    duplicate.manifest.files.push(duplicate.manifest.files[0]);
    expect(() => packPreviewBundle(duplicate)).toThrow();
  });

  it("detects corrupt or invalid compressed configuration", () => {
    const encoded = Buffer.from(packPreviewBundle(bundle), "base64");
    encoded[encoded.length - 5] ^= 1;
    expect(() => openPreviewBundle(Buffer.from(encoded.toString("base64")))).toThrow();
    expect(() => openPreviewBundle(Buffer.from("not base64!"))).toThrow();
  });
});

describe("public Mortal preview", () => {
  it("serves entry and linked reviews anonymously when explicitly enabled", async () => {
    const base = await start({ publicAccess: true, bundlePath });
    for (const [path, expected] of [["analysis/", html], ["analysis/index.html", html], [reviewPath, review]] as const) {
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(`${base}/mortal-preview/${path}`, { method });
        expect(response.status).toBe(200);
        expect(response.headers.get("www-authenticate")).toBeNull();
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(method === "HEAD" ? Buffer.alloc(0) : expected);
      }
    }
  });

  it("does not ask for a password when an old verifier is still configured", async () => {
    const base = await start({ publicAccess: true, authSha256, bundlePath });
    const response = await fetch(`${base}/mortal-preview/analysis/`, { headers: { authorization: "Basic invalid" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("keeps file allowlisting, method restrictions and the existing API in public mode", async () => {
    const base = await start({ publicAccess: true, bundlePath });
    for (const path of ["deploy-manifest.json", "%2e%2e%2f.env", "match_data/unknown.html"]) {
      expect((await fetch(`${base}/mortal-preview/${path}`)).status).toBe(404);
    }
    expect((await fetch(`${base}/mortal-preview/analysis/`, { method: "POST" })).status).toBe(405);
    const api = await fetch(`${base}/api/matches`, { method: "POST" });
    expect([401, 503]).toContain(api.status);
  });

  it("returns unavailable on a missing public snapshot while health remains available", async () => {
    const base = await start({ publicAccess: true, bundlePath: join(directory, "absent.b64") });
    expect((await fetch(`${base}/mortal-preview/analysis/`)).status).toBe(503);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});
