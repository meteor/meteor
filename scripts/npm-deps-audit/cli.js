#!/usr/bin/env node
//
// cli.js — audit the npm dependencies of Meteor core packages (Npm.depends)
//
// Usage:
//   node scripts/npm-deps-audit/cli.js generate [--out <dir>] [--concurrency N]
//   node scripts/npm-deps-audit/cli.js audit    [--out <dir>] [--policy <file>]
//                                               [--fail-on <sev>|none] [<lockfile-dir>...]
//   node scripts/npm-deps-audit/cli.js submit   [--out <dir>] [--dry-run]
//
// `generate` evaluates packages/*/package.js, writes a package.json per package
// under <out> and generates a package-lock.json for each.
// `audit` runs `npm audit --omit=dev` on every generated lockfile plus any
// directories given as positional arguments that already have a
// package-lock.json (e.g. `npm-packages/*`), applies .github/npm-audit-policy.json, prints a markdown
// report (also to $GITHUB_STEP_SUMMARY when set) and exits 1 on blocking
// advisories.
// `submit` posts the generated lockfiles to GitHub's Dependency Submission API
// so Dependabot alerts cover packages/*. Needs GITHUB_TOKEN with contents:write
// plus the standard GITHUB_* Actions variables.
//
// See README.md in this directory.

'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const lib = require('./lib');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function usage(exitCode) {
  const text = fs.readFileSync(__filename, 'utf8').split('\n')
    .slice(2, 22).map((l) => l.replace(/^\/\/ ?/, '')).join('\n');
  (exitCode ? console.error : console.log)(text);
  process.exit(exitCode);
}

function parse(argv, options, allowPositionals = false) {
  try {
    return parseArgs({ args: argv, options, allowPositionals, strict: true });
  } catch (e) {
    console.error(e.message);
    usage(2);
  }
}

async function cmdGenerate(argv) {
  const { values } = parse(argv, {
    out: { type: 'string', default: lib.defaultOutDir() },
    concurrency: { type: 'string', default: '6' },
  });
  const outDir = path.resolve(values.out);
  console.log(`Generating lockfiles for packages/* npm dependencies into ${outDir}`);
  const entries = await lib.generateAll(REPO_ROOT, outDir, {
    concurrency: Number(values.concurrency) || 6,
    log: (line) => console.log(line),
  });
  const ok = entries.filter((e) => e.lockfile).length;
  const failed = entries.filter((e) => e.error);
  console.log(`\n${ok} lockfile(s) generated, ${failed.length} failure(s).`);
  if (failed.length) {
    for (const e of failed) console.error(`  ${e.name}: ${e.error}`);
    process.exit(1);
  }
}

async function cmdAudit(argv) {
  const { values, positionals } = parse(argv, {
    out: { type: 'string', default: lib.defaultOutDir() },
    policy: { type: 'string', default: path.join(REPO_ROOT, '.github', 'npm-audit-policy.json') },
    'fail-on': { type: 'string' },
    'skip-generated': { type: 'boolean', default: false },
  }, true);
  const policy = lib.loadPolicy(values.policy);
  if (values['fail-on']) policy.failOn = values['fail-on'];

  const targets = [];
  if (!values['skip-generated']) {
    for (const entry of lib.readIndex(path.resolve(values.out))) {
      targets.push({
        label: entry.sourcePath.replace(/\/package\.js$/, ''),
        dir: entry.lockfile ? path.dirname(entry.lockfile) : null,
        error: entry.error,
        unauditable: entry.unauditable,
      });
    }
  }
  // Positional arguments are directories with a real package-lock.json, so a
  // shell glob like `npm-packages/*` works. Directories without a
  // package.json (README files, tests) are ignored.
  for (const extra of positionals) {
    const dir = path.resolve(extra);
    if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
    targets.push({
      label: path.relative(REPO_ROOT, dir) || dir,
      dir: fs.existsSync(path.join(dir, 'package-lock.json')) ? dir : null,
      error: fs.existsSync(path.join(dir, 'package-lock.json')) ? undefined : 'no package-lock.json',
    });
  }

  console.error(`Auditing ${targets.length} package(s)...`);
  const results = await lib.mapConcurrent(targets, 4, async (t) => {
    if (!t.dir || t.error) return t;
    try {
      const report = await lib.runNpmAudit(t.dir);
      return { ...t, summary: lib.summarizeAudit(report, policy) };
    } catch (e) {
      return { ...t, error: e.message };
    }
  });

  const markdown = lib.renderMarkdown(results, policy);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## npm dependency audit\n\n${markdown}\n`);
  }

  const blocking = results.reduce((n, r) => n + (r.summary ? r.summary.blocking.length : 0), 0);
  const errors = results.filter((r) => r.error);
  if (errors.length) {
    console.error(`\n${errors.length} package(s) could not be audited.`);
  }
  if (blocking) {
    console.error(`\n${blocking} advisory(ies) at or above "${policy.failOn}" are not allowlisted.`);
    process.exit(1);
  }
  if (errors.length) process.exit(1);
  console.error('\nNo blocking advisories.');
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
    case 'audit': return cmdAudit(rest);
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
