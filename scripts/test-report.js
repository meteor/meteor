#!/usr/bin/env node
// Aggregate worker-report.json files (emitted by `meteor self-test --worker-report`)
// and compute per-test flakiness across N runs.
//
// Each input file is expected to look like:
//   {
//     "generatedAt": "2026-04-24T12:34:56Z",
//     "workers": 3,
//     "durationMs": 134000,
//     "totalRun": 178,
//     "failures": 2,
//     "tests": [
//       { "name": "...", "file": "...", "workerId": 2, "status": "passed",
//         "durationMs": 4231, "retries": 0, "tags": ["net"], "failureReason": "..."? }
//     ]
//   }
//
// Usage:
//   node scripts/test-report.js --input <dir>
//   node scripts/test-report.js --input <dir> --min-runs 5
//   node scripts/test-report.js --input <dir> --format markdown|json
//   node scripts/test-report.js --input <dir> --threshold 5   (only print tests >= 5% flakiness)
//
// Pure Node, no external deps.

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {
    input: null,
    minRuns: 1,
    threshold: 0,
    format: 'markdown',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-i': case '--input':
        out.input = argv[++i];
        break;
      case '--min-runs':
        out.minRuns = parseInt(argv[++i], 10);
        break;
      case '--threshold':
        out.threshold = parseFloat(argv[++i]);
        break;
      case '--format':
        out.format = argv[++i];
        break;
      case '-h': case '--help':
        out.help = true;
        break;
      default:
        if (a.startsWith('--input=')) out.input = a.slice(8);
        else if (a.startsWith('--min-runs=')) out.minRuns = parseInt(a.slice(11), 10);
        else if (a.startsWith('--threshold=')) out.threshold = parseFloat(a.slice(12));
        else if (a.startsWith('--format=')) out.format = a.slice(9);
        else {
          process.stderr.write(`unknown flag: ${a}\n`);
          process.exit(2);
        }
    }
  }
  return out;
}

function readAllReports(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    process.stderr.write(`--input must be an existing directory (got ${dir})\n`);
    process.exit(2);
  }
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
  if (files.length === 0) {
    process.stderr.write(`no *.json reports found in ${dir}\n`);
    process.exit(2);
  }
  const reports = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data.tests)) {
        process.stderr.write(`skipping ${file}: missing "tests" array\n`);
        continue;
      }
      reports.push({ file, data });
    } catch (err) {
      process.stderr.write(`skipping ${file}: ${err.message}\n`);
    }
  }
  if (reports.length === 0) {
    process.stderr.write('no parseable reports\n');
    process.exit(2);
  }
  return reports;
}

function aggregate(reports) {
  // key = "file/name"
  const map = new Map();
  for (const { data } of reports) {
    for (const t of data.tests) {
      const key = `${t.file}/${t.name}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          file: t.file,
          name: t.name,
          runs: 0,
          failures: 0,
          passes: 0,
          totalDurationMs: 0,
          maxDurationMs: 0,
          reasons: new Map(),
          tags: new Set(t.tags || []),
        };
        map.set(key, entry);
      }
      entry.runs += 1;
      if (t.status === 'passed') entry.passes += 1;
      else entry.failures += 1;
      entry.totalDurationMs += t.durationMs || 0;
      entry.maxDurationMs = Math.max(entry.maxDurationMs, t.durationMs || 0);
      if (t.failureReason) {
        entry.reasons.set(t.failureReason, (entry.reasons.get(t.failureReason) || 0) + 1);
      }
      for (const tag of (t.tags || [])) entry.tags.add(tag);
    }
  }

  // Turn into array with computed fields.
  const rows = [];
  for (const e of map.values()) {
    const flakiness = e.failures / e.runs;
    rows.push({
      file: e.file,
      name: e.name,
      runs: e.runs,
      failures: e.failures,
      passes: e.passes,
      flakinessPct: Number((flakiness * 100).toFixed(2)),
      avgDurationMs: Math.round(e.totalDurationMs / e.runs),
      maxDurationMs: e.maxDurationMs,
      tags: Array.from(e.tags).sort(),
      topReason: e.reasons.size === 0
        ? null
        : [...e.reasons.entries()].sort((a, b) => b[1] - a[1])[0][0],
    });
  }
  return rows;
}

function sortRows(rows) {
  // Flakiness desc, then failures desc, then name asc.
  rows.sort((a, b) => {
    if (b.flakinessPct !== a.flakinessPct) return b.flakinessPct - a.flakinessPct;
    if (b.failures !== a.failures) return b.failures - a.failures;
    return a.name.localeCompare(b.name);
  });
}

function renderMarkdown(rows, meta) {
  const out = [];
  out.push(`# Self-test flakiness report`);
  out.push('');
  out.push(`Source: ${meta.reportCount} run report(s) aggregated from \`${meta.input}\`.`);
  out.push(`Filters: \`--min-runs ${meta.minRuns}\`, \`--threshold ${meta.threshold}%\`.`);
  out.push('');
  out.push(`| Flakiness | Runs | Fail/Pass | Avg (s) | Max (s) | File / Test | Top failure |`);
  out.push(`|----------:|-----:|:----------|--------:|--------:|:------------|:------------|`);
  for (const r of rows) {
    const flak = r.flakinessPct.toFixed(2) + '%';
    const ratio = `${r.failures} / ${r.passes}`;
    const avg = (r.avgDurationMs / 1000).toFixed(1);
    const max = (r.maxDurationMs / 1000).toFixed(1);
    const who = `${r.file}.js · ${r.name}`;
    const reason = r.topReason ? r.topReason.slice(0, 80) : '—';
    out.push(`| ${flak} | ${r.runs} | ${ratio} | ${avg} | ${max} | ${who} | ${reason} |`);
  }
  if (rows.length === 0) {
    out.push('| — | — | — | — | — | (nothing above threshold) | — |');
  }
  return out.join('\n') + '\n';
}

function renderJson(rows, meta) {
  return JSON.stringify({ ...meta, tests: rows }, null, 2) + '\n';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    process.stdout.write(
`Usage:
  node scripts/test-report.js --input <dir> [options]

Options:
  --input, -i <dir>    Directory of worker-report-*.json files.
  --min-runs <n>       Only include tests that ran at least n times (default 1).
  --threshold <pct>    Only list tests with flakiness >= pct % (default 0).
  --format <md|json>   Output format (default: markdown).

Exit codes:
  0  no tests above threshold (clean)
  1  at least one test above threshold
  2  usage / input error
`);
    process.exit(args.help ? 0 : 2);
  }
  const reports = readAllReports(args.input);
  const rows = aggregate(reports);
  const filtered = rows.filter((r) => r.runs >= args.minRuns && r.flakinessPct >= args.threshold);
  sortRows(filtered);

  const meta = {
    input: path.resolve(args.input),
    reportCount: reports.length,
    minRuns: args.minRuns,
    threshold: args.threshold,
    generatedAt: new Date().toISOString(),
  };

  const out = args.format === 'json'
    ? renderJson(filtered, meta)
    : renderMarkdown(filtered, meta);
  process.stdout.write(out);
  process.exit(filtered.length > 0 && args.threshold > 0 ? 1 : 0);
}

main();
