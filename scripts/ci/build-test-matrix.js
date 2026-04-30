#!/usr/bin/env node
// Reads a JSON array of self-tests (as written by
// `./meteor self-test --list-json-out PATH`) and emits a single-line JSON
// object on stdout suitable for piping into $GITHUB_OUTPUT, e.g.:
//   ./meteor self-test --list-json-out /tmp/tests.json
//   node scripts/ci/build-test-matrix.js /tmp/tests.json
//
// Output shape:
//   {"include":[{id, name, file, junit, regex, resources}, ...]}
//
// - id: zero-padded ordinal, used in artifact names and JUnit filenames.
// - name: the original test name (kept for the GHA job display).
// - file: source file basename (without .js).
// - junit: filesystem-safe filename for --junit output.
// - regex: regex-escaped, anchored form of `name` for `./meteor self-test`.
// - resources: "heavy" for tests in HEAVY_FILES, otherwise "default". The
//              workflow promotes this to elevated container resources.

'use strict';

const fs = require('node:fs');

// Files whose tests build full apps (Cordova, modern bundler, compiler
// plugins). Currently mirrors the regex-group hand-tuning in test-tools.yml
// (Group 0 and Group 5 were given --cpus 4 --memory 16g for these reasons).
const HEAVY_FILES = new Set([
  'modern',
  'compiler-plugins',
  'cordova-builds',
  'cordova-hcp',
  'cordova-plugins',
  'cordova-platforms',
  'cordova-append-config',
  'modules',
  'modules-modern',
]);

// Escape a string so it can be used as a literal inside a JS RegExp source.
// The set matches what `meteor self-test` compiles via `new RegExp(arg)`.
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

const padWidth = String(tests.length).length;
const include = tests.map((t, i) => {
  const id = String(i + 1).padStart(padWidth, '0');
  return {
    id,
    name: t.name,
    file: t.file,
    junit: `${id}.xml`,
    regex: `^${escapeRegex(t.name)}$`,
    resources: HEAVY_FILES.has(t.file) ? 'heavy' : 'default',
  };
});

process.stdout.write(JSON.stringify({ include }) + '\n');
process.stderr.write(`build-test-matrix: ${include.length} entries `
  + `(${include.filter((e) => e.resources === 'heavy').length} heavy)\n`);
