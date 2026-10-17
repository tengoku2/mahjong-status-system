import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { openPreviewBundle, sha256 } from "./mortal-preview-bundle.js";

export interface MortalPreviewOptions {
  authSha256?: string;
  bundlePath?: string;
}

const prefix = "/mortal-preview";
// The saved reviews contain analytics and Tenhou frames with game data in their URLs.
// Permit only KaTeX's static math assets; do not send review data to other services.
const csp = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://unpkg.com/katex@0.16.4/dist/katex.min.js https://unpkg.com/katex@0.16.4/dist/contrib/auto-render.min.js",
  "style-src 'unsafe-inline' https://unpkg.com/katex@0.16.4/dist/katex.min.css",
  "font-src https://unpkg.com/katex@0.16.4/dist/fonts/",
  "img-src data:", "connect-src 'none'", "frame-src 'none'", "object-src 'none'",
  "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"
].join("; ");

export function createMortalPreviewHandler(options: MortalPreviewOptions = {
  authSha256: process.env.MORTAL_PREVIEW_AUTH_SHA256,
  bundlePath: process.env.MORTAL_PREVIEW_BUNDLE_PATH?.trim() || undefined
}) {
  let loaded: Promise<Map<string, Buffer> | null> | undefined;
  function loadFiles() {
    loaded ??= readFile(options.bundlePath ?? resolve("private/mortal-preview.bundle.b64"))
      .then((encoded) => openPreviewBundle(encoded))
      .catch(() => {
        console.error("Mortal preview is unavailable: check its private bundle and configuration.");
        return null;
      });
    return loaded;
  }

  return async (request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> => {
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return false;
    response.setHeader("cache-control", "private, no-store");
    response.setHeader("vary", "Authorization");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("x-robots-tag", "noindex, nofollow, noarchive");
    response.setHeader("content-security-policy", csp);

    function finish(status: number, message: string) {
      response.statusCode = status;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end(request.method === "HEAD" ? undefined : message);
      return true;
    }
    if (!/^[a-f0-9]{64}$/i.test(options.authSha256 ?? "")) {
      return finish(503, "Preview unavailable.");
    }
    const auth = request.headers.authorization;
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(auth ?? "");
    const credentials = match ? Buffer.from(match[1], "base64") : Buffer.alloc(0);
    const actual = Buffer.from(sha256(credentials), "hex");
    const expected = Buffer.from(options.authSha256!, "hex");
    if (!match || !credentials.includes(58) || !timingSafeEqual(actual, expected)) {
      response.setHeader("www-authenticate", 'Basic realm="Mortal private preview", charset="UTF-8"');
      return finish(401, "Authentication required.");
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("allow", "GET, HEAD");
      return finish(405, "Method Not Allowed");
    }
    const files = await loadFiles();
    if (!files) return finish(503, "Preview unavailable.");
    if (pathname === prefix || pathname === `${prefix}/` || pathname === `${prefix}/analysis`) {
      response.setHeader("location", `${prefix}/analysis/`);
      return finish(302, "Open the preview.");
    }
    let path: string;
    try { path = decodeURIComponent(pathname.slice(prefix.length + 1)); }
    catch { return finish(404, "Not Found"); }
    if (path === "analysis/") path += "index.html";
    const data = files.get(path);
    if (!data) return finish(404, "Not Found");
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("content-length", data.length);
    response.end(request.method === "HEAD" ? undefined : data);
    return true;
  };
}
