# Issue #14655: production build memory and source-map investigation

## Status and scope

This is the working source of truth for investigating
[#14655](https://github.com/meteor/meteor/issues/14655), a production build
failure involving large Rspack client output passing through Meteor's linker.
It consolidates source inspection, upstream reports, forum research, local
probes, and reproduction requirements. It is not a claim that the full issue
has been reproduced or fixed locally.

| Item | Baseline |
| --- | --- |
| Investigation date | September 5, 2026, America/Campo_Grande |
| Project | `meteor` |
| Local root | `/Users/leonardo/Repositories/meteor/meteor` |
| Inspected checkout | `devel`, commit `0bbf7f33bd` |
| Report branch | `investigation/14655-rspack-build-memory` |
| Upstream status when checked | Open; release 3.6 milestone |
| Latest issue evidence inspected | September 3, 2026 comment |
| Full local reproduction | Not attempted |
| Implementation changes | None |

The requested deliverable is an investigation report. Its acceptance criteria
are traceable evidence, explicit uncertainty, a reproducible description of
the local probe, a feasible reproduction approach, and a discoverable location
in the Rspack development documentation. Proposed experiments below are not
completed work or approval of a particular implementation.

### Evidence vocabulary

- **Verified source:** directly inspected behavior in the baseline checkout.
- **Verified probe:** executed locally, with the scope and limitations recorded.
- **Reported:** observations supplied by an upstream contributor; not independently
  reproduced here.
- **Hypothesis:** a causal explanation that still requires an experiment.
- **Proposed:** a future check or implementation option, not an executed result.

Future updates must preserve these distinctions. Record the actual commit,
runtime, dependency versions, command, architecture set, cache state, and output
artifacts for each experiment. Replace assumptions with measurements without
silently removing superseded conclusions.

## Findings at a glance

The strongest current hypothesis is that large source maps exceed the scaling
assumptions of several stages in Meteor's build pipeline. There are separate
failure mechanisms with different remedies:

1. Decoding maps and creating per-mapping source nodes can amplify memory use.
2. Legacy compilation performs additional work on already-bundled client code.
3. Link-cache serialization combines code and maps into one bounded JavaScript
   string, even after linking succeeds.
4. The SWC disk-cache writer lets asynchronous failures escape its intended
   error handler.

The first two mechanisms require profiling to quantify. The latter two are
visible in source; a small fault-injection probe confirmed the asynchronous
error-handling behavior. None of these observations proves the precise cause
of the upstream WASM trap.

## Upstream evidence and corrections

The [original issue](https://github.com/meteor/meteor/issues/14655) reports
production builds failing after Rspack compilation, including with `--debug`.
Its smaller reproduction produces approximately 17 MB of code and a 102 MB map.
The initial description calls the failure a heap OOM.

Later discussion revises an apparent modern-only bypass success: benchmarks
showed no clear improvement, and the old-space limit did not constrain total
memory. The investigation shifted toward architecture-independent map
concatenation.

The [September 3 report](https://github.com/meteor/meteor/issues/14655#issuecomment-5524097370)
describes a larger, approximately 68 MB bundle and 418 MB map. An alternative
concatenator passed an isolated operation that trapped with the WASM baseline,
but complete builds then failed during link-cache and compiler-cache JSON
serialization. The alternative also required a fix for appending enormous
arrays through argument spreading.

These are contributor measurements, not local results. The smaller and larger
workloads must remain distinct. A passing isolated concatenation operation is
not equivalent to a successful production build.

### Terminology that matters

- `RuntimeError: unreachable`, JavaScript heap exhaustion, and
  `RangeError: Invalid string length` are different failure signatures. Do not
  merge them into one generic OOM result.
- The reported `writeFileCache` function lives in `babel-compiler.js`, but the
  inspected implementation belongs to **`writeToSwcCache`**. Record the selected
  transpiler rather than identifying it from the package filename.
- “Legacy” can mean the `web.browser.legacy` target or the classic Meteor build
  stack without Rspack. Those are different controls.
- `--debug` changes Meteor's build behavior. It does not by itself prove that
  every upstream Rspack optimization or source-map operation was disabled.

## Source trace and root-cause hypotheses

The links below refer to repository files; symbols and baseline line numbers
identify the inspected sections. Line numbers may move after the baseline.

### 1. Generated client output enters Meteor's build pipeline

In [build-context.js](../../../packages/rspack/lib/build-context.js),
`getImportContent` (around line 574) generates wrappers that import Rspack
output for production/build contexts. This makes emitted bundles inputs to
Meteor's subsequent integration steps.

In [babel-compiler.js](../../../packages/babel-compiler/babel-compiler.js),
`processOneFileForTarget`'s Rspack detection (around line 236) bypasses SWC/Babel
for recognized output only when the architecture is not legacy. The modern
path reads and parses the adjacent map. The legacy path proceeds through the
configured transpiler; both compiler option paths enable source maps.

**Verified source:** modern and legacy outputs follow different compilation
paths. **Hypothesis:** additional legacy transformations increase code/map size
enough to expose failures that the modern target avoids.

**Required evidence:** capture code and maps at the Rspack output, post-transpiler,
and post-linker boundaries for each architecture. Measure mapping length,
source count, name count, `sourcesContent` length, and serialized size. Do not
assume the large raw Rspack map and the legacy compiler's map are identical.

### 2. Linker expands encoded maps into source-node trees

In [linker.js](../../../tools/isobuild/linker.js),
`getPrelinkedOutputCached` (around line 758) constructs a `SourceMapConsumer`
and calls `SourceNode.fromStringWithSourceMap`. `Module#getPrelinkedFiles`
(around line 237) combines chunks and calls `toStringWithSourceMap` to emit code
and regenerate the combined map. The tool dependency is pinned to `source-map`
0.7.4 in [dev-bundle-tool-package.js](../../../scripts/dev-bundle-tool-package.js).

**Verified source:** the linker changes the map representation and regenerates
it; the map is not merely copied. The consumer is explicitly destroyed on the
successful path, so a missing successful-path `destroy()` is not the leading
explanation.

**Hypothesis:** decoded mappings, source nodes, generated code, input maps,
and regenerated maps coexist long enough to create severe peak memory pressure.
The precise WASM failure could involve allocation limits or a library defect;
the error text alone cannot establish which.

**Required evidence:** compare implementations with identical code, map,
wrappers, offsets, and process isolation. Measure process RSS externally,
identify the failing stack, and validate mappings as well as completion.

### 3. Expanded structures may remain in memory across targets

`getPrelinkedOutputCached` in [linker.js](../../../tools/isobuild/linker.js)
uses an `optimism` cache bounded by 4,096 entries, with architecture in the key.
Its values contain source-node output. Entry count does not bound bytes for
very large inputs. Other prelink caches have different sizing policies.

The linked-result cache in
[compiler-plugin.js](../../../tools/isobuild/compiler-plugin.js) uses a size
estimate from [sourceMapLength](../../../tools/utils/utils.js), which counts
mappings and source contents but omits names and other metadata.

**Hypothesis:** retained expanded representations and approximate accounting
increase whole-build peaks or cross-architecture accumulation. No local heap
snapshot confirms retention magnitude or identifies this as the initial crash.
Check reachability and per-stage memory before proposing cache policy changes.

### 4. Link-cache serialization imposes a separate hard limit

In [compiler-plugin.js](../../../tools/isobuild/compiler-plugin.js),
`PackageSourceBatch#_linkJS` (around lines 1850–1883) constructs resources with
string code in `data` and a parsed `sourceMap`. When disk caching is enabled,
it calls `JSON.stringify(ret)` before converting code to buffers.

**Verified source:** all resources in that result are serialized together;
there is no size-aware fallback around serialization. Successful linking can
therefore be followed by a fatal cache preparation error. JSON escaping can
increase length beyond a simple sum of input file sizes.

**Verified probe:** installed Meteor's Node 24.15.0 reports
`buffer.constants.MAX_STRING_LENGTH = 536870888`. This limit is measured in
UTF-16 code units, not UTF-8 bytes. The shell's Node 26.5.1 reports the same value.
More V8 old space cannot raise this string-length ceiling. See the
[Node buffer constant documentation](https://nodejs.org/api/buffer.html#bufferconstantsmax_string_length).

**Required evidence:** independently trigger cache serialization after successful
linking, record the payload composition, and prove an oversized cache entry can
be handled without changing emitted program contents. A mocked serialization
error tests recovery behavior; it does not establish the real input threshold.

### 5. SWC cache write failures become unhandled rejections

In [babel-compiler.js](../../../packages/babel-compiler/babel-compiler.js),
`writeToSwcCache` (around line 1034) defines an async writer that awaits directory
creation and then serializes the compilation. The caller invokes it without
`await` or `.catch()`, inside a synchronous `try/catch`.

**Verified source and probe:** a rejection from that writer escapes the outer
handler. The same function was inspected on upstream `release-3.6`; the relevant
behavior matched the local checkout. Termination behavior depends on runtime
unhandled-rejection handling, but the missing local rejection handling is
independently established.

The probe extracted the actual function into a VM context, substituted no-op
filesystem methods, and injected a `RangeError` from `JSON.stringify`. It
observed `unhandledRejection`. It wrote no cache file and allocated no huge map.
See the reproducible probe in the appendix.

**Implication:** making optional cache writes recoverable is a distinct concern
from reducing source-map memory. Handling this rejection alone will not repair
the linker or prove complete builds succeed.

### 6. Later output serialization remains a boundary to test

In [bundler.js](../../../tools/isobuild/bundler.js), final client map emission
(around line 1794) also calls `JSON.stringify(file.sourceMap)` before producing
a buffer. Related serialization exists for server output.

**Verified source:** cache writers are not the only consumers requiring a whole
map string. **Hypothesis:** still larger maps could fail at final output even
after cache failures are addressed. The reported cache failure does not prove
this later boundary fails for the same fixture: map-only output can be smaller
than code-plus-map cache JSON.

## Forum evidence and related work

Forum searches covered the issue number, Rspack memory, linker OOM, source maps,
`Invalid string length`, and the proposed concatenation library. No explicit
forum discussion of #14655 or its cache-serialization failure was found. Search
coverage is not proof that no such discussion exists.

| Source | Relevant evidence | Limit of applicability |
| --- | --- | --- |
| [Rspack 2.0 Released, post 6](https://forums.meteor.com/t/rspack-2-0-released/64576/6) | Links the #14443/#14464 investigation, which attributed large-app development growth to generated server bundles and source-node structures retained inside Meteor's tool. Describes loading server output directly through Node and measuring distinct process families. | Development server rebuild retention differs from a production client build's peak memory and serialization failure. |
| [Very bumpy upgrade to 3.4.1 and Rspack](https://forums.meteor.com/t/very-bumpy-upgrade-to-3-4-1-and-rspack-still-cant-build/64650) | Users report repeated edits/rebuilds leading to OOM and connect observations to #14443. | Supports a related integration problem, not a reproduction of #14655. |
| [Faster minifier with SWC and improved source maps](https://forums.meteor.com/t/faster-minifier-with-swc-and-improved-source-maps/60262) | The 2023 announcement reports faster concatenation using `@zodern/source-maps`; a user reports a previously failing build succeeding after the minifier update. | The update also changed parsing/minification. Its total memory benefit cannot be attributed solely to the map library or assumed to transfer to this linker. |

The existing [memory benchmark guide](MEMORY_BENCHMARK.md) describes
[scripts/build-stack-memory-bench.js](../../../scripts/build-stack-memory-bench.js)
and links [PR #14464](https://github.com/meteor/meteor/pull/14464). Its workload
uses repeated development rebuilds and roughly 6,000 server modules. It provides
process attribution ideas for this investigation, not a ready-made production
reproduction. Its samples follow rebuild readiness and a settling delay, so its
retention measurements need external periodic or high-water measurement to
capture transient production peaks. The guide also states that the harness changes the disposable
app's packages/configuration; restoration of a touched source file does not
restore all those changes.

## Reproduction fixture and harness audit

The upstream fixture was inspected at immutable commit
[`1b5049829f27ad51ce6508c0d4419367d490e82b`](https://github.com/miamagana/meteor-rspack-oom-repro/tree/1b5049829f27ad51ce6508c0d4419367d490e82b).
No clone, dependency installation, generated fixture, or build was executed.

### Version controls

| Component | Inspected fixture value |
| --- | --- |
| `.meteor/release` | `METEOR@3.5` |
| Atmosphere Rspack package | `rspack@1.1.0` |
| Atmosphere tools-core package | `tools-core@1.1.0` |
| npm lock: Meteor adapter | `@meteorjs/rspack@2.1.0` |
| npm lock: Rspack core and CLI | `1.7.12` |

The manifest uses ranges; preserve the lockfile and use the selected Meteor
runtime's `npm ci` for a baseline. Check dependency auto-install behavior and
record any lockfile/package changes after startup. A published-release baseline
and a source-checkout baseline may use different Meteor package code; keep
their results separate and record both versions and actual executable paths.

### Workload

[`generate.js`](https://github.com/miamagana/meteor-rspack-oom-repro/blob/1b5049829f27ad51ce6508c0d4419367d490e82b/generate.js)
procedurally generates modules and exposes functions through a global registry,
which makes the workload resistant to simple unused-code elimination. It is a
credible stress fixture, but synthetic. Its generated-directory cleanup must
only run inside a disposable fixture checkout.

Use `MODULES` and `FUNCS` as distinct recorded dimensions:

- `20 × 50`: reported small passing control.
- `800 × 400`: default workload, associated with the initial smaller report.
- `3200 × 400`: larger workload used in the later investigation.

Output sizes are observations to measure, not guaranteed consequences of those
parameters across dependency versions or configurations.

### Instrumentation defects to correct first

| Harness | Inspected limitation | Requirement before trusting results |
| --- | --- | --- |
| [`bench.js`](https://github.com/miamagana/meteor-rspack-oom-repro/blob/1b5049829f27ad51ce6508c0d4419367d490e82b/bench.js) | RSS matching requires both `tools/index.js` and `meteor-checkout` in the command line. It can miss installed Meteor and this checkout. | Identify the launched process and descendants without developer-specific directory names; distinguish tool RSS from summed process RSS. |
| `bench.js` | Removes selected Rspack/build directories but retains `.meteor/local`. | Define separate cold and warm states for Meteor, compiler, linker, and Rspack caches. |
| `bench.js` | Lacks a timeout, robust spawn-error handling, and exit-signal reporting. | Capture exit code, signal, timeout/resource termination, logs, and failure stage. |
| [`micro.js`](https://github.com/miamagana/meteor-rspack-oom-repro/blob/1b5049829f27ad51ce6508c0d4419367d490e82b/micro.js) | Hardcodes another developer's dependency location and requires both implementations. | Parameterize exact dependency locations/versions; support a baseline-only run. |
| `micro.js` | Timer-based RSS sampling misses synchronous peaks; compared wrappers/offsets differ. | Sample externally, run fresh processes, and compare identical transformation semantics. |
| [`compare-sourcemaps.js`](https://github.com/miamagana/meteor-rspack-oom-repro/blob/1b5049829f27ad51ce6508c0d4419367d490e82b/compare-sourcemaps.js) | Can overlook missing manifests/maps and asymmetric files; sparse line sampling misses much of minified output. | Require matching expected outputs and sample mapping segments, boundaries, names, and wrapper offsets. |

RSS sums can include shared pages and sampled peaks can miss short spikes.
Record collection method and interval; do not equate an RSS sum with uniquely
owned physical memory or a JavaScript heap measurement.

## Local readiness and checks actually executed

| Check | Result |
| --- | --- |
| Repository index | SCS index ready; used for initial code exploration |
| Source and issue inspection | Completed for the paths and upstream evidence recorded above |
| Platform/runtime | macOS arm64; shell Node `v26.5.1` |
| Installed Meteor tool | Launcher points to 3.5.1; 3.5.0 and 3.5.1 bundles available, both with Node `v24.15.0` |
| Checkout dependencies at readiness inspection | `dev_bundle`, root `node_modules`, and unit/E2E test `node_modules` absent |
| Disk space at readiness inspection | Approximately 192 GiB available |
| RAM headroom | Unverified; system query was sandbox-denied |
| String-limit query | `536870888` code units on shell Node and installed Meteor 3.5.1 Node |
| SWC writer fault injection | Actual extracted function emitted an unhandled rejection as predicted |
| Report verification | Appendix probe and installed-runtime constant query rerun; all relative file links resolved; independent source/document review completed |
| Full or isolated large-map build | Not executed |
| Existing test suite | Not executed |

Readiness is a point-in-time observation. Recheck resources and dependencies
before running experiments. Network reads required sandbox escalation in some
cases; no package installation was performed during the analysis.

## Proposed experiment sequence and acceptance criteria

The desired outcome of the next phase is a locally repeatable failure with a
specific stage and signature, plus a small passing control. Do not start with a
replacement library and infer the baseline afterward.

1. **Prepare a disposable, pinned fixture.** Record its SHA, Meteor executable,
   runtime, package locks, effective transpiler, architecture list, and source-map
   configuration. Check available memory. Correct instrumentation and define
   wall-time/resource termination before large runs.
2. **Establish the small control.** Generate `20 × 50`; run production and debug
   builds. Require successful exit and expected code/maps for the selected
   architectures. Verify the app boots and its generated registry is populated.
3. **Isolate architecture effects.** Compare modern-only with modern plus legacy;
   record Cordova separately if included. Confirm manifest contents rather than
   relying only on configuration names. Use controlled cache states.
4. **Increase size gradually.** Hold `FUNCS=400` while increasing `MODULES`
   geometrically toward 800. Run one memory-intensive experiment at a time.
   Record the earliest failing stage and preserve input/output artifacts.
5. **Separate stages.** Feed captured code/maps into an equivalent concatenation
   microbenchmark. Test cache error recovery independently. Record map composition
   before and after the compiler/linker, not just the final file size.
6. **Test a candidate only against the established baseline.** Repeat normal/debug,
   architecture, and cold/warm comparisons. Require mapping correctness and
   runtime behavior as well as resource improvement.
7. **Attempt `3200 × 400` only after the smaller results are understood.** Repeat
   failure-prone cases in fresh processes and report all attempts, not only
   successful runs. A resource-guard termination is not the same as a tool crash.

For each run, retain: run ID, revision, command/environment, dependency versions,
host/runtime, generator parameters, actual architectures, cache preparation,
timestamps, exit code/signal, logs, failure stack, stage timings, sampled tool
RSS, process-family RSS, heap metrics when available, code/map sizes and hashes,
and correctness results. Heap limits and sampling intervals belong in the
metadata. Keep raw logs and large generated artifacts outside the source tree.

### Testing architecture and gaps

[tools/tests/source-maps.js](../../../tools/tests/source-maps.js) covers mapping
behavior for tool/app/plugin stack traces. The E2E
[server-runtime tests](../../../tools/e2e-tests/server-runtime.test.js) provide
related runtime/debugger infrastructure. Neither reviewed surface demonstrates
coverage of this large production client map failure.

Small procedural tests should cover wrapper offsets, multiple sources/names,
empty/unmapped regions, source contents, and supported map formats. Indexed maps
need either correct support or a verified fallback. Cache failure tests should
inject errors without allocating hundreds of megabytes, verify rejection
handling, and verify output equivalence when disk caching is unavailable.

Large stress cases belong outside the ordinary unit-test budget. The inspected
[unit configuration](../../../tools/unit-tests/jest.config.js) defaults to a
10-second timeout. Integration tests can reuse the CLI self-test sandbox or E2E
build helpers once a focused regression is designed. Design and execute these
tests before or alongside any implementation; no coverage claim is made here.

## Candidate remedies and decision boundaries

| Candidate | What it could address | What remains to prove |
| --- | --- | --- |
| Encoded-map concatenation | Avoids expanding every mapping into source nodes | Correct offsets/names/source roots and map formats; actual RSS benefit; complete builds; large-array handling in the dependency |
| Recoverable oversized cache writes | Prevents optional caches from aborting valid compilation/linking | Correct output, appropriate error handling, warm-build behavior, no hidden corruption |
| Different cache serialization | Avoids one monolithic code-plus-map string | Read/write compatibility, atomicity, invalidation, bounded memory on reads as well as writes |
| Generic prebundled-file handling | Reduces redundant processing where output already satisfies the target contract | Legacy compilation requirements, packaging/order/hash semantics, mapping integrity, measured benefit |
| Reduced or omitted source maps | Reduces workload | Debugging/product contract and acceptable scope; not a transparent default fix |
| Architecture exclusion | Can avoid the legacy path | Explicit target-support tradeoff; a control/workaround rather than proof of a general fix |

No remedy has been selected. Increasing heap is a diagnostic variation, not a
solution to the fixed string-length limit. A source-map library change alone
does not address cache serialization. A modern-only bypass cannot establish
legacy correctness.

Before implementation, prepare the appropriately scoped spec and tests. Obtain
explicit approval for new production dependencies, persisted cache-format
changes, public plugin APIs, or major architectural changes. Record any selected
architectural decision after implementation. This report does not authorize
those choices or replace their compatibility review.

## Open questions

- What precise map representation and compiler path produce the largest input?
- Is the first WASM trap an allocation boundary, malformed input, or another
  implementation constraint? Can a smaller independent fixture isolate it?
- How much memory is transient versus retained by caches across architectures?
- Which paths fail on the pinned published release versus current source?
- Does the alternative concatenator improve whole-build RSS, not only one stage?
- Can all required maps be emitted after cache recovery, including production
  minification and legacy compilation?
- Which source-map properties are unsupported by the proposed library, and what
  is the resource behavior of the fallback?
- What benchmark thresholds are repeatable on this host after checking RAM?

## Handoff and maintenance

Recommended review order: status/evidence definitions; source trace; fixture
audit; local verification; experiment acceptance criteria; candidate boundaries.

No runtime interface, dependency, cache format, or production behavior changes
with this report. The branch contains investigation documentation and its index
link only. Documentation rollback is a normal revert of its commit; no data
migration or deployment recovery is required.

Update this file when a run completes, a hypothesis is falsified, or a remedy
is selected. Add dated run records with artifact references and distinguish
baseline results from patched results. Refresh source references if symbols or
files move. Avoid copying benchmark numbers into the README; link here instead.

## Appendix: executed lightweight probe

The following command was executed from the repository root with shell Node
26.5.1. It runs the actual cache-writer function with mocked filesystem methods
and serialization. Expected result: an observed unhandled `RangeError` and exit
code zero. It demonstrates the error-handler defect only.

```bash
node <<'NODE'
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('packages/babel-compiler/babel-compiler.js', 'utf8');
const start = source.indexOf('BCp.writeToSwcCache = function');
const end = source.indexOf('\nfunction getMeteorAppDir', start);
const sandbox = {
  BCp: {},
  SwcCacheContext: '.swc-cache',
  path: require('node:path'),
  fs: { promises: { mkdir: async () => {}, writeFile: async () => {} } },
  JSON: {
    stringify() {
      throw new RangeError('simulated oversized cache serialization');
    },
  },
};
vm.runInNewContext(source.slice(start, end), sandbox);
let observed = false;
process.once('unhandledRejection', error => {
  observed = true;
  console.log('Observed unhandled rejection from actual writeToSwcCache:',
    error.name, error.message);
});
sandbox.BCp.writeToSwcCache.call(
  { _swcCache: {}, cacheDirectory: '/unused' },
  { cacheKey: 'probe', compilation: {} },
);
setImmediate(() => {
  console.log(JSON.stringify({
    node: process.version,
    arch: process.arch,
    maxStringCodeUnits: require('node:buffer').constants.MAX_STRING_LENGTH,
    unhandledRejectionObserved: observed,
  }));
  process.exitCode = observed ? 0 : 1;
});
NODE
```

Observed values: `node=v26.5.1`, `arch=arm64`,
`maxStringCodeUnits=536870888`, `unhandledRejectionObserved=true`.
The probe intercepts the rejection to report it; it does not measure the default
Meteor process's termination policy. The separate installed-runtime constant
query returned Node `v24.15.0` and the same string limit.
