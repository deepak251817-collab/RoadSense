#!/usr/bin/env node
/**
 * STARS regression runner (P30) — no external dependencies.
 *
 * Two kinds of suites live in this directory:
 *  - module suites (import project code, e.g. t21–t26): source modules use
 *    extensionless relative imports which Node ESM cannot resolve, so the runner
 *    builds a temp harness (copies of src/utils + src/services with .js
 *    extensions added) and runs the suite there — the same harness convention
 *    used during development.
 *  - source/bundle suites (t27–t29): read files from the repo (src/, dist/,
 *    index.html) and must run with the repo root as cwd.
 *
 * Usage: npm test   (or: node tests/run-all.mjs)
 */
import { spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
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

// Add .js to relative imports idempotently (Node ESM cannot resolve
// the extensionless imports Vite accepts).
const addExtensions = (src) =>
  src.replace(/from "(\.[^"]*?)(\.js)?";/g, 'from "$1.js";');

// A suite is a "module suite" if it imports project code by relative path.
const isModuleSuite = (code) =>
  /^import[\s\S]*?from "\.\/(src|utils|services)\//m.test(code) ||
  /^} from "\.\/(src|utils|services)\//m.test(code);

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
  const needsDist = code.includes("dist/");
  if (needsDist) ensureDist();

  let status = 0;
  let out = "";

  if (isModuleSuite(code)) {
    // Temp harness: copies of utils + services with resolvable imports.
    const T = mkdtempSync(join(tmpdir(), "stars-test-"));
    try {
      mkdirSync(join(T, "utils"));
      mkdirSync(join(T, "services"));
      cpSync(join(ROOT, "src", "utils"), join(T, "utils"), { recursive: true });
      cpSync(join(ROOT, "src", "services"), join(T, "services"), { recursive: true });
      for (const dir of ["utils", "services"]) {
        for (const f of readdirSync(join(T, dir))) {
          if (!f.endsWith(".js")) continue;
          const p = join(T, dir, f);
          const src = readFileSync(p, "utf8");
          const rewritten = addExtensions(src);
          if (rewritten !== src) writeFileSync(p, rewritten);
        }
      }
      const suiteCode = code
        .replace(/from "\.\/src\/utils\//g, 'from "./utils/')
        .replace(/from "\.\/src\/services\//g, 'from "./services/');
      writeFileSync(join(T, file), suiteCode);
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
