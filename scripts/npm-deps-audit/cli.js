#!/usr/bin/env node
//
// cli.js — make Meteor core packages' npm dependencies (Npm.depends) scannable
//
// Usage:
//   node scripts/npm-deps-audit/cli.js generate [--out <dir>] [--repo-root <dir>] [--concurrency N]
//
// `generate` statically parses <repo-root>/packages/*/package.js for
// Npm.depends / npmDependencies, writes a package.json per package under <out>
// and generates a package-lock.json for each. Nothing from package.js runs.
// Exits 1 if any package.js cannot be parsed or resolved, so a non-literal
// Npm.depends can never be silently skipped.
//
// The generated directory is what the Socket CLI scans in
// .github/workflows/npm-dependency-audit.yml. See README.md in this directory.

'use strict';

const path = require('path');
const { parseArgs } = require('util');
const lib = require('./lib');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..');

function usage(exitCode) {
  const text = require('fs').readFileSync(__filename, 'utf8').split('\n')
    .slice(2, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n');
  (exitCode ? console.error : console.log)(text);
  process.exit(exitCode);
}

function parse(argv, options) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: false, strict: true });
  } catch (e) {
    console.error(e.message);
    usage(2);
  }
}

async function cmdGenerate(argv) {
  const { values } = parse(argv, {
    out: { type: 'string', default: lib.defaultOutDir() },
    'repo-root': { type: 'string', default: DEFAULT_REPO_ROOT },
    concurrency: { type: 'string', default: '6' },
  });
  const outDir = path.resolve(values.out);
  const repoRoot = path.resolve(values['repo-root']);
  console.log(`Generating manifests for ${repoRoot}/packages/* npm dependencies into ${outDir}`);
  const entries = await lib.generateAll(repoRoot, outDir, {
    concurrency: Number(values.concurrency) || 6,
    log: (line) => console.log(line),
  });
  const ok = entries.filter((e) => e.lockfile).length;
  const failed = entries.filter((e) => e.error);
  console.log(`\n${ok} lockfile(s) generated, ${failed.length} failure(s).`);
  if (failed.length) {
    for (const e of failed) console.error(`  ${e.error}`);
    process.exit(1);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'generate': return cmdGenerate(rest);
    case '-h': case '--help': case 'help': case undefined: return usage(command ? 0 : 2);
    default:
      console.error(`Unknown command: ${command}\n`);
      return usage(2);
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
