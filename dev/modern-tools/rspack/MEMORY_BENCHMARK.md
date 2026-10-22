# Investigating Rspack rebuild memory

Use `scripts/build-stack-memory-bench.js` when memory increases while a
Meteor-Rspack app rebuilds in development. The script runs the same rebuild
workload repeatedly and separates memory used by `meteor-tool`, the application
server, and child processes such as Rspack, TypeScript, and MongoDB.

This benchmark was created during the investigation and fix for the large-app
memory-retention issue in [PR #14464](https://github.com/meteor/meteor/pull/14464).

> ⚠️ Run the benchmark against a disposable app checkout. It updates
`.meteor/packages` and `package.json` while comparing variants. The touched
source file is restored when the run finishes, but package and Rspack
configuration changes are not.

## Run the large-app benchmark

The reproduction used in the investigation is available at
[`nachocodoner/meteor-large-app`](https://github.com/nachocodoner/meteor-large-app).
It includes a Blaze application with roughly 6,000 server modules, which makes
rebuild-time retention easier to reproduce than in a small application.

Clone the fixture beside the Meteor checkout and install its dependencies:

```bash
git clone https://github.com/nachocodoner/meteor-large-app \
  /path/to/meteor-large-app

cd /path/to/meteor-large-app/blaze
meteor npm install
```

From the Meteor checkout, run the default comparison:

```bash
cd /path/to/meteor

APP_PATH=/path/to/meteor-large-app/blaze \
TOUCH_FILE=server/main.js \
node scripts/build-stack-memory-bench.js
```

The default `matrix` mode records the first build and ten server rebuilds for
each configuration: legacy Meteor bundling, the default Rspack configuration,
and variants with cache or source maps disabled. The script resets Meteor
between variants and links the app to the local `@meteorjs/rspack` checkout.

## Understand the result

Each rebuild prints a process-tree sample similar to this:

```text
RSS Total: 2460 MB, Tool: 950 MB, App: 140 MB, Other: 1370 MB, FDs: 48, Procs: 7
```

At the end, the summary reports the growth rate and deltas for each variant:

```text
Variant                  | Tool Slope       | App Slope        | Total Slope (MB/rebuild)
baseline                 | +0.8 MB          | -0.4 MB          | +12.1 MB
```

The numbers above are illustrative. Compare runs using the same app, rebuild
count, and timing rather than using a universal RSS limit.

- A rising `Tool Slope` or `toolRSS` indicates pressure in `meteor-tool`, such
  as linker, watcher, or integration retention.
- A stable `toolRSS` with a rising `otherRSS` points to a child process. Check
  `OTHER PROCESS ATTRIBUTION` to distinguish `rspack-node`, the TypeScript
  checker, MongoDB, and other processes.
- Give the first few samples less weight. They include initial compilation and
  cache warm-up; post-warm values are more useful for deciding whether growth
  is sustained.

Matrix mode writes `repro-report.json`, `repro-summary.json`, and
`repro-report.csv` in the current directory.

## Capture a heap snapshot

When `meteor-tool` is the growing process, use `leak` mode to rebuild one
configuration until it reaches an RSS threshold. The script then asks Node to
write a heap snapshot and saves `leak-report.json` with the measurements and
snapshot path.

```bash
APP_PATH=/path/to/meteor-large-app/blaze \
TOUCH_FILE=server/main.js \
MODE=leak \
LEAK_VARIANT=baseline \
LEAK_MAX_CYCLES=200 \
LEAK_RSS_THRESHOLD_MB=2000 \
TOOL_NODE_FLAGS="--max-old-space-size=4096 --heapsnapshot-signal=SIGUSR2" \
node scripts/build-stack-memory-bench.js
```

`leak` mode adds the heap-snapshot signal when it is not already present in
`TOOL_NODE_FLAGS`. It captures the Meteor tool process, not a Rspack or
TypeScript child process, so use it when `toolRSS` is the growing metric.

## Validate against the installed Meteor release

After identifying a result with the local checkout, repeat the same matrix
workload against the installed Meteor release. This separates a checkout-only
change from behavior that is present in the release you are comparing.

```bash
USE_GLOBAL=true \
APP_PATH=/path/to/meteor-large-app/blaze \
TOUCH_FILE=server/main.js \
node scripts/build-stack-memory-bench.js
```

## Useful options

| Option | Use |
| --- | --- |
| `MAX_CYCLES=50` | Run more rebuilds in matrix mode. |
| `SKIP_RESET=true` | Keep generated caches between variants for a warm-cache experiment. Do not compare this directly with a reset run. |
| `SETTLE_TIME=10000` | Wait longer before sampling a slow rebuild. |
| `CYCLE_TIMEOUT=180000` | Allow more time for startup or rebuild readiness. |
| `READY_PATTERN="Server is now online"` | Match an app-specific readiness message. |
| `PORT=4000` | Use a free application port. |
| `USE_GLOBAL=true` | Test the installed Meteor release instead of the current checkout. |
| `METEOR_PATH=/path/to/meteor` | Test a specific Meteor binary. |
| `TOOL_NODE_FLAGS="--inspect --max-old-space-size=4096"` | Attach a debugger or raise the Node heap limit. |

For every option and its default, run:

```bash
node scripts/build-stack-memory-bench.js --help
```

Then run the same workload against a smaller application to make sure the
change does not trade a large-app improvement for a regression elsewhere.
