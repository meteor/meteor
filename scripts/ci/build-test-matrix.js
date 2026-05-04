#!/usr/bin/env node
// Reads a JSON array of self-tests (as written by
// `./meteor self-test --list-json-out PATH`) and emits a single-line JSON
// object on stdout suitable for piping into $GITHUB_OUTPUT, e.g.:
//   ./meteor self-test --list-json-out /tmp/tests.json
//   node scripts/ci/build-test-matrix.js /tmp/tests.json
//
// Output shape (one entry per test FILE — all tests in a file run together
// in one job, sharing the prepared-app-cache and per-process build state):
//   {"include":[{id, name, file, junit, fileRegex, count, resources}, ...]}
//
// - id: zero-padded ordinal, used in artifact names and JUnit filenames.
// - file: source file basename (without .js).
// - name: display label for the GHA job (file + test count).
// - junit: filesystem-safe filename for --junit output.
// - fileRegex: regex-escaped, anchored form of `file` for `--file`.
// - count: number of tests in the file (informational).
// - resources: "heavy" for tests in HEAVY_FILES, otherwise "default".

'use strict';

const fs = require('node:fs');

// Files whose tests build full apps (Cordova, modern bundler, compiler
// plugins). Currently mirrors the regex-group hand-tuning in test-tools.yml
// (Group 0 and Group 5 were given --cpus 4 --memory 16g for these reasons).
const HEAVY_FILES = new Set([
  'modern',
  'modern-transpiler',
  'modern-build',
  'compiler-plugins',
  'compiler-plugins-local',
  'compiler-plugins-features',
  'cordova-builds',
  'cordova-hcp',
  'cordova-plugins',
  'cordova-platforms',
  'cordova-append-config',
  'modules',
  'modules-modern',
  'package-tests-changes',
  'package-tests-versions',
]);

function escapeRegex(s) {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

const inputPath = process.argv[2];
if (!inputPath) {
  process.stderr.write('build-test-matrix: missing input path argument\n');
  process.exit(1);
}

let tests;
try {
  tests = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (err) {
  process.stderr.write(`build-test-matrix: failed to read ${inputPath}: ${err.message}\n`);
  process.exit(1);
}

if (!Array.isArray(tests) || tests.length === 0) {
  process.stderr.write('build-test-matrix: no tests in input\n');
  process.exit(1);
}

// Group tests by file. Insertion order is preserved (--list-json emits in
// the order tests were registered, which keeps related files adjacent).
const byFile = new Map();
for (const t of tests) {
  if (!byFile.has(t.file)) byFile.set(t.file, 0);
  byFile.set(t.file, byFile.get(t.file) + 1);
}

const padWidth = String(byFile.size).length;
let i = 0;
const include = [];
for (const [file, count] of byFile) {
  i++;
  const id = String(i).padStart(padWidth, '0');
  include.push({
    id,
    file,
    name: `${file}.js (${count} test${count === 1 ? '' : 's'})`,
    junit: `${id}-${file}.xml`,
    fileRegex: `^${escapeRegex(file)}$`,
    count,
    resources: HEAVY_FILES.has(file) ? 'heavy' : 'default',
  });
}

process.stdout.write(JSON.stringify({ include }) + '\n');
process.stderr.write(`build-test-matrix: ${include.length} files, `
  + `${tests.length} tests `
  + `(${include.filter((e) => e.resources === 'heavy').length} heavy files)\n`);
