#!/usr/bin/env node
"use strict";

// Run from the repo root AFTER committing and BEFORE pushing:
//     node ~/Downloads/fix-1/checkCommit.js
//
// It reads what is in the latest commit (not what is on your disk) and checks that every
// relative require("./x") / require("../x") in every committed .js file points at a file that is
// ALSO in that commit. That is exactly the failure Render hit: code on your laptop loads fine
// because the missing file exists there, but the commit that gets deployed doesn't contain it.

const { execSync } = require("child_process");
const path = require("path");

const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

let files;
try {
  files = git("ls-tree -r --name-only HEAD").split("\n").map((f) => f.trim()).filter(Boolean);
} catch (e) {
  console.error("Not a git repository, or there is no commit yet.");
  process.exit(2);
}

const inCommit = new Set(files.map((f) => f.replace(/\\/g, "/")));
const isCode = (f) => /\.(js|cjs|mjs)$/.test(f) && !f.startsWith("node_modules/");
const REQUIRE_RE = /\brequire\(\s*(["'])(\.{1,2}\/[^"']*)\1\s*\)/g;

const candidates = (base) => [base, `${base}.js`, `${base}.json`, `${base}.cjs`, `${base}.mjs`, `${base}/index.js`];

const missing = [];
for (const file of files.filter(isCode)) {
  let text;
  try {
    text = git(`show HEAD:"${file}"`);
  } catch (_) {
    continue;
  }
  let m;
  while ((m = REQUIRE_RE.exec(text)) !== null) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[2]));
    if (!candidates(target).some((c) => inCommit.has(c))) {
      missing.push({ file, spec: m[2], expected: `${target}.js` });
    }
  }
}

// Untracked files that committed code needs: the most likely cause, so say so explicitly.
let untracked = new Set();
try {
  git("ls-files --others --exclude-standard")
    .split("\n").map((f) => f.trim()).filter(Boolean).forEach((f) => untracked.add(f.replace(/\\/g, "/")));
} catch (_) {}

if (!missing.length) {
  console.log(`OK: all relative requires in the ${files.filter(isCode).length} committed .js files resolve inside the commit.`);
  process.exit(0);
}

console.error(`\nDO NOT PUSH. ${missing.length} require(s) in the commit point at files the commit does not contain:\n`);
for (const x of missing) {
  const onDisk = [x.expected, x.expected.replace(/\.js$/, "")].some((c) => untracked.has(c) || untracked.has(c + ".js"));
  console.error(`  ${x.file}\n    requires ${x.spec}  ->  ${x.expected}${onDisk ? "   (exists on your disk but is NOT committed: git add it)" : ""}`);
}
console.error("\nFix: git add the missing file(s) and make a NEW commit (never amend one that is already pushed), then run this again.\n");
process.exit(1);
