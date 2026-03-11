#!/usr/bin/env node

const fs = require('fs');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (process.argv.length < 5) {
  fail('Usage: aggregate-results.js <startNs> <endNs> <resultFile...>');
}

let startNs;
let endNs;
try {
  startNs = BigInt(process.argv[2]);
  endNs = BigInt(process.argv[3]);
} catch (error) {
  fail(`Invalid start/end timestamp: ${error.message}`);
}

const files = process.argv.slice(4);
let methodCalls = 0;

for (const file of files) {
  let parsed;
  try {
    const data = fs.readFileSync(file, 'utf8').trim();
    parsed = JSON.parse(data);
  } catch (error) {
    fail(`Cannot parse benchmark result file '${file}': ${error.message}`);
  }

  const calls = Number(parsed.method_calls || 0);
  if (!Number.isFinite(calls) || calls < 0) {
    fail(`Invalid method_calls in '${file}': ${parsed.method_calls}`);
  }

  methodCalls += calls;
}

const elapsedSeconds = Number(endNs - startNs) / 1e9;
const callsPerSecond = elapsedSeconds > 0 ? methodCalls / elapsedSeconds : 0;

process.stdout.write(JSON.stringify({
  method_calls: methodCalls,
  time_to_process_s: elapsedSeconds,
  calls_per_second: callsPerSecond,
}));
