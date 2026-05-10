import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

type Mode = "summary" | "redacted";

interface Options {
  inputPath: string;
  outputDir: string;
  mode: Mode;
}

interface RedactionReport {
  inputFile: string;
  outputFile: string;
  mode: Mode;
  replacements: Record<string, number>;
  warnings: string[];
}

const args = process.argv.slice(2);

function usage(): never {
  console.error("Usage: tsx scripts/sanitize-tanki-sample.ts <input-file> [--out samples/sanitized] [--mode summary|redacted]");
  process.exit(1);
}

function parseArgs(): Options {
  const inputPath = args[0];
  if (!inputPath || inputPath.startsWith("--")) {
    usage();
  }

  let outputDir = "samples/sanitized";
  let mode: Mode = "summary";

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      outputDir = args[index + 1] ?? usage();
      index += 1;
    } else if (arg === "--mode") {
      const value = args[index + 1];
      if (value !== "summary" && value !== "redacted") {
        usage();
      }
      mode = value;
      index += 1;
    } else {
      usage();
    }
  }

  return {
    inputPath: resolve(inputPath),
    outputDir: resolve(outputDir),
    mode
  };
}

function increment(report: RedactionReport, key: string, count = 1) {
  report.replacements[key] = (report.replacements[key] ?? 0) + count;
}

function placeholderFactory(report: RedactionReport) {
  const values = new Map<string, string>();
  const counters = new Map<string, number>();

  return (kind: string, value: string) => {
    const key = `${kind}:${value}`;
    const existing = values.get(key);
    if (existing) {
      increment(report, kind);
      return existing;
    }

    const next = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, next);
    const replacement = `${kind.toUpperCase()}_${String(next).padStart(3, "0")}`;
    values.set(key, replacement);
    increment(report, kind);
    return replacement;
  };
}

function redactText(text: string, report: RedactionReport): string {
  const replace = placeholderFactory(report);
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, (value) => replace("database_url", value))
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g, (value) => replace("token", value))
    .replace(/https?:\/\/[^\s"'<>]+/gi, (value) => replace("url", value))
    .replace(/\b(?:usr|wrld|avtr|grp|file)_[A-Za-z0-9-]+\b/g, (value) => replace("vrc_id", value))
    .replace(/\b\d{17,20}\b/g, (value) => replace("discord_id", value))
    .replace(/\b[A-Z]:\\[^\r\n"'<>|]+/g, (value) => replace("windows_path", value))
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, (value) => replace("email", value))
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (value) => replace("ip_address", value));
}

function summarizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 3).map((entry) => summarizeJson(entry))
    };
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: "object",
      fieldCount: entries.length,
      fields: entries.slice(0, 30).map(([key, entry]) => ({
        keyHash: hashLabel(key),
        value: summarizeJson(entry)
      }))
    };
  }

  if (typeof value === "number") {
    return {
      type: "number",
      example: value
    };
  }

  if (typeof value === "boolean") {
    return {
      type: "boolean"
    };
  }

  if (typeof value === "string") {
    return {
      type: "string",
      length: value.length,
      looksLikeDate: !Number.isNaN(Date.parse(value))
    };
  }

  return {
    type: value === null ? "null" : typeof value
  };
}

function redactJsonStrings(value: unknown, report: RedactionReport): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonStrings(entry, report));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, redactJsonStrings(entry, report)]));
  }

  if (typeof value === "string") {
    increment(report, "json_string");
    if (!value) {
      return "";
    }
    if (!Number.isNaN(Date.parse(value))) {
      return "DATE_TIME_001";
    }
    return `STRING_LEN_${value.length}`;
  }

  return value;
}

function hashLabel(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `FIELD_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function main() {
  const options = parseArgs();
  await mkdir(options.outputDir, { recursive: true });

  const original = await readFile(options.inputPath, "utf8");
  const report: RedactionReport = {
    inputFile: basename(options.inputPath),
    outputFile: "",
    mode: options.mode,
    replacements: {},
    warnings: []
  };

  let output: string;
  const extension = extname(options.inputPath).toLowerCase();

  if (options.mode === "summary") {
    try {
      const parsed = JSON.parse(original);
      output = JSON.stringify(
        {
          source: basename(options.inputPath),
          note: "Summary mode does not expose original values or original field names.",
          shape: summarizeJson(parsed)
        },
        null,
        2
      );
    } catch {
      const redacted = redactText(original, report);
      output = JSON.stringify(
        {
          source: basename(options.inputPath),
          note: "Text summary keeps only coarse metrics and redaction counts.",
          lineCount: original.split(/\r?\n/).length,
          charCount: original.length,
          redactedPreview: redacted.slice(0, 1000)
        },
        null,
        2
      );
      report.warnings.push("Input was not JSON. Preview is pattern-redacted text; review before sharing.");
    }
  } else {
    try {
      const parsed = JSON.parse(original);
      output = JSON.stringify(redactJsonStrings(parsed, report), null, 2);
      report.warnings.push("Redacted mode keeps original JSON field names. Do not share if field names are licensed/internal.");
    } catch {
      output = redactText(original, report);
      report.warnings.push("Input was not JSON. Pattern redaction cannot guarantee all proprietary text was removed.");
    }
  }

  const suffix = options.mode === "summary" ? ".summary.json" : `.redacted${extension || ".txt"}`;
  const outputFile = join(options.outputDir, `${basename(options.inputPath, extension)}${suffix}`);
  const reportFile = join(options.outputDir, `${basename(options.inputPath, extension)}.redaction-report.json`);
  report.outputFile = basename(outputFile);

  await writeFile(outputFile, output, "utf8");
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`output=${outputFile}`);
  console.log(`report=${reportFile}`);
  console.log("Review both files before sharing. Do not share redacted mode output if it still contains licensed/internal field names.");
}

await main();
