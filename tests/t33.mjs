/**
 * t33.mjs — P33 security audit regression suite.
 * Runs from the repo root (source/bundle suite).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
};

const read = (p) => readFileSync(p, "utf8");

console.log("# secrets & repository hygiene");

t(".env is not tracked by git (only .env.example)", () => {
  const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n");
  assert.ok(tracked.includes(".env.example"), ".env.example should be tracked");
  assert.ok(!tracked.includes(".env"), ".env must NOT be tracked");
});

t(".env is git-ignored", () => {
  const r = execSync("git check-ignore .env", { encoding: "utf8" });
  assert.ok(r.includes(".env"), "check-ignore should match .env");
});

t(".env.example contains only empty placeholders", () => {
  const lines = read(".env.example")
    .split("\n")
    .filter((l) => /^VITE_[A-Z_]+=/.test(l));
  assert.ok(lines.length >= 3, "expected several VITE_ placeholders");
  for (const l of lines) {
    assert.equal(l.split("=")[1], "", `placeholder must be empty: ${l.split("=")[0]}=…`);
  }
});

t("no secret-like literals in tracked source", () => {
  const secretRe = /sk\.[a-zA-Z0-9]{20,}|pk\.[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|[a-f0-9]{32}/;
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
    );
  const files = [...walk("src"), "index.html"];
  for (const f of files) {
    assert.ok(!secretRe.test(read(f)), `secret-like literal in ${f}`);
  }
});

t("rotation notice present in .env.example and README", () => {
  assert.ok(/rotat/i.test(read(".env.example")), ".env.example must mention rotation");
  assert.ok(/rotat/i.test(read("README.md")), "README must mention rotation");
});

t("security audit report exists and leaks no secret patterns", () => {
  assert.ok(existsSync("docs/SECURITY_AUDIT.md"), "docs/SECURITY_AUDIT.md missing");
  const doc = read("docs/SECURITY_AUDIT.md");
  assert.ok(!/sk\.[a-zA-Z0-9]{30,}|pk\.[a-zA-Z0-9]{30,}|AIza[0-9A-Za-z_-]{30,}/.test(doc),
    "audit doc must not contain key material");
});

console.log("# client-side injection");

const app = read("src/app/App.jsx");

t("no dangerous sinks in src", () => {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
    );
  for (const f of walk("src")) {
    const code = read(f);
    assert.ok(!code.includes("dangerouslySetInnerHTML"), `dangerouslySetInnerHTML in ${f}`);
    assert.ok(!/[^.\w]eval\(/.test(code), `eval( in ${f}`);
    assert.ok(!code.includes("new Function("), `new Function( in ${f}`);
  }
});

t("report popup escapes severity (stored-XSS fix)", () => {
  assert.ok(
    app.includes("escapePopupHtml(String(rep.severity || \"\").toUpperCase())"),
    "rep.severity must be escaped before innerHTML"
  );
});

t("report popup escapes type label fallback (stored-XSS fix)", () => {
  assert.ok(
    app.includes("escapePopupHtml(hazardTypeMeta(rep.type).label)"),
    "type label (raw fallback) must be escaped before innerHTML"
  );
});

t("report popup still escapes description", () => {
  assert.ok(app.includes("const safeDesc = (rep.description || \"\")"), "description escaping removed");
});

t("segment popup keeps its esc() wrapper", () => {
  assert.ok(app.includes("const esc = (v) => String(v ?? '')"), "segment esc() helper missing");
});

t("target=_blank links carry a rel (tab-nabbing guard)", () => {
  const check = (file) => {
    const src = read(file);
    let idx = 0;
    while ((idx = src.indexOf('target="_blank"', idx)) !== -1) {
      const window = src.slice(idx, idx + 160);
      assert.ok(/rel="[^"]*(noreferrer|noopener)/.test(window),
        `${file}: target=_blank without rel near offset ${idx}`);
      idx += 15;
    }
  };
  check("src/app/App.jsx");
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
    );
  for (const f of walk("src/features")) check(f);
});

console.log("# runtime hardening (regression from P28/P29)");

t("app is wrapped in an error boundary", () => {
  const main = read("src/main.jsx");
  assert.ok(main.includes("<ErrorBoundary>"), "main.jsx must wrap App in ErrorBoundary");
});

t("no unguarded promise chains in App.jsx", () => {
  const lines = app.split("\n");
  const unguarded = [];
  lines.forEach((line, i) => {
    if (!line.includes(".then(")) return;
    const win = [lines[i], lines[i + 1] || "", lines[i + 2] || ""].join("\n");
    if (!win.includes(".catch(")) unguarded.push(i + 1);
  });
  assert.deepEqual(unguarded, [], `unguarded .then( at lines ${unguarded.join(",")}`);
});

console.log(`\n${passed} tests passed`);
