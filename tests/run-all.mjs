#!/usr/bin/env node
/**
 * STARS regression runner — no external dependencies.
 *
 * Suites come in two kinds:
 *  - module suites (t21–t26): import app code via ./src/… specifiers. Source
 *    modules use extensionless relative imports (Vite-style) that Node ESM
 *    cannot resolve, so the runner mirrors src/ into a temp harness, adds .js
 *    extensions to relative imports, and runs the suite there.
 *  - source/bundle suites (t27–t29): read files from the repo (src/, dist/,
 *    index.html) and run with the repo root as cwd.
 *
 * Usage: npm test   (or: node tests/run-all.mjs)
 */
import { spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TESTS = join(ROOT, "tests");

const suites = readdirSync(TESTS)
  .filter((f) => /^t\d+.*\.mjs$/.test(f))
  .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));

if (!suites.length) {
  console.error("No suites found in tests/");
  process.exit(1);
}

// Add .js to relative imports idempotently (Node ESM cannot resolve the
// extensionless relative imports that Vite accepts).
const addExtensions = (src) =>
  src.replace(/from "(\.[^"]*?)(\.js)?";/g, 'from "$1.js";');

// A module suite imports app code through ./src/… specifiers.
const isModuleSuite = (code) => /^import[\s\S]*?from "\.\/src\//m.test(code);

function walkJs(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkJs(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const ensureDist = () => {
  if (existsSync(join(ROOT, "dist", "index.html"))) return;
  console.log("dist/ missing — running npm run build first...");
  const r = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

let failed = 0;
const results = [];

for (const file of suites) {
  const path = join(TESTS, file);
  const code = readFileSync(path, "utf8");
  if (code.includes("dist/")) ensureDist();

  let status = 0;
  let out = "";

  if (isModuleSuite(code)) {
    // Temp harness: full mirror of src/ with resolvable imports.
    const T = mkdtempSync(join(tmpdir(), "stars-test-"));
    try {
      cpSync(join(ROOT, "src"), join(T, "src"), { recursive: true });
      // Link node_modules into the harness so app modules that import real
      // dependencies (e.g. exifr) resolve from the temp dir. Junctions need
      // no admin rights on Windows; plain symlinks elsewhere.
      if (existsSync(join(ROOT, "node_modules"))) {
        try {
          symlinkSync(join(ROOT, "node_modules"), join(T, "node_modules"),
            process.platform === "win32" ? "junction" : "dir");
        } catch { /* resolution falls back to failing loudly below */ }
      }
      for (const p of walkJs(join(T, "src"))) {
        const src = readFileSync(p, "utf8");
        const rewritten = addExtensions(src);
        if (rewritten !== src) writeFileSync(p, rewritten);
      }
      writeFileSync(join(T, file), code);
      const r = spawnSync("node", [file], { cwd: T, encoding: "utf8", timeout: 60000 });
      status = r.status ?? 1;
      out = `${r.stdout || ""}${r.stderr || ""}`;
    } finally {
      rmSync(T, { recursive: true, force: true });
    }
  } else {
    const r = spawnSync("node", [join("tests", file)], {
      cwd: ROOT, encoding: "utf8", timeout: 60000,
    });
    status = r.status ?? 1;
    out = `${r.stdout || ""}${r.stderr || ""}`;
  }

  const ok = status === 0;
  if (!ok) failed++;
  results.push({ file, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${file}`);
  if (!ok) {
    console.log(out.replace(/^/gm, "      ").trimEnd());
    console.log();
  }
}

console.log("\n=== Regression summary ===");
for (const r of results) console.log(`${r.ok ? " ✓" : " ✗"} ${r.file}`);
console.log(`${suites.length - failed}/${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
