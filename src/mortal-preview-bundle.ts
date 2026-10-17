import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

const maxBundleBytes = 32 * 1024 * 1024;
const maxHtmlBytes = 8 * 1024 * 1024;

export interface PreviewManifest {
  generation_id: string;
  view_version: string;
  analysis_version: string;
  entrypoint: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

export interface PreviewBundle {
  manifest: PreviewManifest;
  files: Record<string, string>;
}

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function validatePreviewBundle(bundle: PreviewBundle): Map<string, Buffer> {
  const { manifest, files } = bundle;
  if (!manifest || !files || manifest.entrypoint !== "analysis/index.html" ||
      !/^[a-f0-9]{64}$/.test(manifest.generation_id) ||
      typeof manifest.view_version !== "string" || typeof manifest.analysis_version !== "string" ||
      !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > 20) {
    throw new Error("Invalid preview manifest.");
  }
  const result = new Map<string, Buffer>();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" ||
        !(file.path === manifest.entrypoint || /^match_data\/(?:auto\/)?[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.html$/.test(file.path)) ||
        result.has(file.path) || !Number.isInteger(file.bytes) || file.bytes < 1 || file.bytes > maxHtmlBytes ||
        !/^[a-f0-9]{64}$/.test(file.sha256) || typeof files[file.path] !== "string") {
      throw new Error("Invalid preview file.");
    }
    const data = Buffer.from(files[file.path], "utf8");
    if (data.length !== file.bytes || sha256(data) !== file.sha256) throw new Error("Preview checksum mismatch.");
    result.set(file.path, data);
  }
  if (!result.has(manifest.entrypoint) || Object.keys(files).length !== result.size) {
    throw new Error("Unexpected preview files.");
  }
  return result;
}

export function packPreviewBundle(bundle: PreviewBundle): string {
  validatePreviewBundle(bundle);
  const json = Buffer.from(JSON.stringify(bundle), "utf8");
  if (json.length > maxBundleBytes) throw new Error("Preview bundle is too large.");
  // Encoding is for Koyeb's text config files, not a confidentiality mechanism.
  // This data must only be uploaded to private service configuration, never Git.
  return gzipSync(json).toString("base64");
}

export function openPreviewBundle(encoded: Buffer): Map<string, Buffer> {
  if (encoded.length > maxBundleBytes) throw new Error("Preview bundle is too large.");
  const text = encoded.toString("utf8").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error("Invalid preview bundle.");
  const compressed = Buffer.from(text, "base64");
  const json = gunzipSync(compressed, { maxOutputLength: maxBundleBytes }).toString("utf8");
  return validatePreviewBundle(JSON.parse(json) as PreviewBundle);
}
