#!/usr/bin/env node
//
// cli.js — make Meteor core packages' npm dependencies (Npm.depends) scannable
//
// Usage:
//   node scripts/npm-deps-audit/cli.js generate    [--out <dir>] [--repo-root <dir>] [--concurrency N]
//   node scripts/npm-deps-audit/cli.js apply-fixes [--out <dir>] [--repo-root <dir>] [--summary <file>]
//                                                  [--socket-report <file>] [--dry-run]
//   node scripts/npm-deps-audit/cli.js submit      [--out <dir>] [--dry-run]
//
// generate     Statically parse <repo-root>/packages/*/package.js for
//              Npm.depends / npmDependencies, write a package.json per package
//              under <out> and generate a package-lock.json for each. Nothing
//              from package.js runs. Exits 1 if any package.js cannot be parsed.
// apply-fixes  After a fixer (socket fix) edited the generated package.json
//              files, write the changed versions back into package.js. Prints
//              a markdown summary; sets `changed=true|false` in $GITHUB_OUTPUT.
// submit       Post the generated lockfiles to GitHub's Dependency Submission
//              API so Dependabot alerts cover packages/*. Needs GITHUB_TOKEN
//              with contents:write plus the standard GITHUB_* variables.
//
// See README.md in this directory.

'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const lib = require('./lib');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..');

function usage(exitCode) {
  const text = fs.readFileSync(__filename, 'utf8').split('\n')
    .slice(2, 21).map((l) => l.replace(/^\/\/ ?/, '')).join('\n');
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

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
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
  const ok = entries.filter((e) => e.hasLockfile).length;
  const failed = entries.filter((e) => e.error);
  console.log(`\n${ok} lockfile(s) generated, ${failed.length} failure(s).`);
  if (failed.length) {
    for (const e of failed) console.error(`  ${e.error}`);
    process.exit(1);
  }
}

async function cmdApplyFixes(argv) {
  const { values } = parse(argv, {
    out: { type: 'string', default: lib.defaultOutDir() },
    'repo-root': { type: 'string', default: DEFAULT_REPO_ROOT },
    summary: { type: 'string' },
    'socket-report': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  });
  const outDir = path.resolve(values.out);
  const repoRoot = path.resolve(values['repo-root']);
  let socketReport;
  if (values['socket-report'] && fs.existsSync(values['socket-report'])) {
    try {
      socketReport = JSON.parse(fs.readFileSync(values['socket-report'], 'utf8'));
    } catch (_e) {
      console.error(`Could not parse ${values['socket-report']}; continuing without it.`);
    }
  }
  const results = lib.applyFixes(repoRoot, outDir, { dryRun: values['dry-run'] });
  const summary = lib.renderFixSummary(results, { socketReport });
  console.log(summary);
  if (values.summary) fs.writeFileSync(values.summary, summary + '\n');
  const changed = results.some((r) => Object.keys(r.changed).length);
  setOutput('changed', changed ? 'true' : 'false');
  const touched = results.filter((r) => Object.keys(r.changed).length).map((r) => r.sourcePath);
  console.error(changed
    ? `\n${values['dry-run'] ? 'Would update' : 'Updated'} ${touched.length} package.js file(s): ${touched.join(', ')}`
    : '\nNo package.js changes.');
}

async function cmdSubmit(argv) {
  const { values } = parse(argv, {
    out: { type: 'string', default: lib.defaultOutDir() },
    'dry-run': { type: 'boolean', default: false },
  });
  const entries = lib.readIndex(path.resolve(values.out));
  const snapshot = lib.buildSnapshot(entries);
  const manifestCount = Object.keys(snapshot.manifests).length;
  const depCount = Object.values(snapshot.manifests)
    .reduce((n, m) => n + Object.keys(m.resolved).length, 0);
  if (values['dry-run']) {
    console.log(JSON.stringify(snapshot, null, 2));
    console.error(`\nDry run: ${manifestCount} manifest(s), ${depCount} resolved package(s). Nothing submitted.`);
    return;
  }
  const res = await lib.submitSnapshot(snapshot);
  console.log(`Submitted snapshot ${res.id}: ${manifestCount} manifest(s), ${depCount} resolved package(s).`);
  console.log(res.message || res.result || '');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'generate': return cmdGenerate(rest);
    case 'apply-fixes': return cmdApplyFixes(rest);
    case 'submit': return cmdSubmit(rest);
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
