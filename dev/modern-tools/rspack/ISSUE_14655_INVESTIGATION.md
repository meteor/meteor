# Issue #14655: production build memory and source-map investigation

## Status and scope

This is the working source of truth for investigating
[#14655](https://github.com/meteor/meteor/issues/14655), a production build
failure involving large Rspack client output passing through Meteor's linker.
It consolidates source inspection, upstream reports, forum research, local
probes, and reproduction requirements. A local production-build heap OOM has
now been reproduced repeatedly and localized to legacy source-node expansion.
A diagnostic bypass of large expanded-tree cache entries lets both targets
complete; each target also completes independently.
The later upstream WASM trap and cache string-length failures have not been
reproduced locally. No production fix has been adopted.

| Item | Baseline |
| --- | --- |
| Investigation date | September 5, 2026, America/Campo_Grande |
| Project | `meteor` |
| Local root | `/Users/leonardo/Repositories/meteor/meteor` |
| Inspected checkout | `devel`, commit `0bbf7f33bd` |
| Report branch | `investigation/14655-rspack-build-memory` |
| Upstream status when checked | Open; release 3.6 milestone |
| Latest issue evidence inspected | September 3, 2026 comment |
| Local build checkout | First seven runs: `bd99bb206c`; runs 8–10: `5306673fe5` (documentation-only changes); runs 11–12: that source plus checkout probes; policy comparison: `057d48492b` plus the experimental harness recorded below |
| Full local reproduction | Repeatable heap OOM at `MODULES=400 FUNCS=400`, legacy-inclusive debug build; individual runs and policy matrices below |
| Passing controls | Same workload: modern-only, legacy-only, and both targets with diagnostic large-tree cache bypass; fresh linker-cache controls |
| Implementation changes | No production fix; verified opt-in checkout probes and explicit experimental policy preloads. Default cache policy unchanged. |

The requested deliverables are an investigation report and opt-in checkout
probes to verify the performance findings, followed by a comparison of candidate
cache fixes. Their acceptance criteria
are traceable evidence, explicit uncertainty, a reproducible description of
the local probe, output-preserving instrumentation, a feasible reproduction
approach, and a discoverable location
in the Rspack development documentation. Proposed experiments below are not
completed work or approval of a particular implementation. Executed experiments
are recorded separately under "Local reproduction results".

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

Local stage logging now confirms substantial source-node memory amplification:
modern expansion increased heap usage by approximately 901 MiB, and the process
aborted during legacy expansion. Legacy-only completion and the cache-bypass
intervention now strongly implicate cross-architecture expanded-tree retention
in this fixture; removing the bypass restores the failure. The other cache
mechanisms remain visible in source;
a small fault-injection probe confirmed the asynchronous error-handling defect.
No oversized-cache failure was reached in these builds. The upstream WASM
`unreachable` trap remains a separate, unverified failure signature.

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

**Local update:** the 400-module trace recorded 8,621,197 code units entering
modern expansion and 17,658,034 entering legacy expansion. Legacy code growth
is therefore measured for this fixture. The complete post-transpiler legacy map
has not yet been extracted and characterized independently.

**Remaining evidence:** capture code and maps at the Rspack output, post-transpiler,
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

**Local update:** the fresh-linker-cache trace reaches
`LINKER CACHE MISS: null web.browser.legacy`, enters
`SourceNode.fromStringWithSourceMap` at baseline `linker.js:759`, and aborts with V8 heap
exhaustion before that call returns. Modern expansion and recomposition completed
earlier in the same process. This identifies the failing operation for the
local heap OOM; it does not identify the cause of the distinct upstream WASM trap.

**Remaining evidence:** compare implementations with identical code, map,
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
increase whole-build peaks or cross-architecture accumulation. The modern node
tree is stored through the `optimism` wrapper, and its cache key includes the
architecture. Main module-tree linking does not pass `disableCache`.
`METEOR_APP_PRELINK_CACHE_SIZE` controls a different cache; it does not bound this
expanded-tree cache. The trace starts legacy expansion with approximately
1,269 MiB of heap already in use. However, no heap snapshot or controlled cache
experiment has measured how much of that heap is retained specifically by this
cache. Subsequent controls substantially strengthen the causal evidence: legacy
alone succeeds, both targets succeed when large trees are omitted from this
cache, and the normal cache behavior fails again with warmed compiler/Rspack
caches. Legacy expansion starts with 392 MiB of heap under the bypass versus
1,397 MiB in the corresponding baseline. See "Cache-isolation follow-up" below.
These interventions implicate the cache's contribution without measuring the
retained size of individual objects or establishing a general production policy.

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
At the initial readiness inspection, no clone, dependency installation,
generated fixture, or build had been executed. The fixture was subsequently
cloned and inspected locally; see the security review below.

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

## Initial local readiness and checks

This table describes the initial analysis, before the subsequent setup and
builds recorded under "Local reproduction results". It is retained as history,
not the current execution status.

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

## External reproduction security review

On September 5, 2026 (local time), the fixture was cloned into
`/Users/leonardo/Repositories/meteor/repro-14655/app`. Its HEAD matched the pinned
`1b5049829f27ad51ce6508c0d4419367d490e82b` revision and its worktree was clean.
Before installing dependencies or executing fixture code, a static review
covered all tracked first-party JavaScript, HTML/CSS, README, manifests,
lockfile metadata, Meteor configuration, and local Git configuration/hooks.

**Result: no evidence of intentional malware was found in the inspected
first-party code or dependency metadata. This is not a certification of the
third-party package contents or downloaded native binaries.**

No first-party credential collection, outbound upload code, obfuscated payload,
dynamic evaluation, persistence mechanism, or remote script download was found.
The HTML's external URLs are ordinary navigation links. `bench.js` executes a
constant `ps` command and launches the configured Meteor executable with an
argument array. It inherits the environment into that child; this is not itself
evidence of exfiltration, but dependencies would execute with the child's access.

The concrete execution hazards are:

- `bench.js:42–45` recursively removes its output directory, `_build`, and
  `node_modules/.cache`. The output path incorporates unchecked `OUT`, label,
  and mode values. Path traversal in those inputs can escape the intended
  results directory. Use a containment-checked harness before running it.
- `generate.js:18` removes `imports/generated` and regenerates it. That is
  expected behavior, but must remain confined to a disposable checkout with
  verified directory ancestry. Its workload parameters have no upper bounds.
- The generator, build, and microbenchmark deliberately create memory pressure.
  They have no effective whole-process memory guard and can exhaust resources.
- `METEOR` and `SOURCE_MAP_LIB` select executable code; use explicitly trusted
  paths. The microbenchmark also hardcodes another developer's dependency path.

An independent dependency/configuration review found 489 non-root lockfile
entries. Of these, 370 resolve to HTTPS npm-registry tarballs with SHA-512
integrity metadata and package names matching their install paths. The other
119 are marked `inBundle` beneath the integrity-pinned `meteor-node-stubs`
package. No git, local-file, plain-HTTP, alias, or linked dependencies were found.
Integrity pins identify expected bytes; they do not prove those bytes are safe.

The root manifest has no installation lifecycle scripts. Two dependency entries
declare installation scripts: `@swc/core@1.15.47` and optional macOS
`fsevents@2.3.3`. Their downloaded source and native artifacts have not been
audited. The Meteor package list did not reveal unexpected configuration, but
this review did not inspect every resolved Atmosphere package implementation.
There were no tracked symlinks, `.npmrc`, submodules, active local Git hooks, or
custom local Git execution settings; only standard sample hooks were present.

No fixture code or dependency lifecycle script was executed during this review.
The earlier `@meteor --version` invocation ran the trusted core checkout and
reported sandbox-related watcher errors; it was not a reproduction run.
Before continuing, prefer an initial dependency fetch with lifecycle scripts
disabled, review any required installation scripts before enabling them, use
trusted executable paths, and bound the generator/build workload. Changes to
fixture code or dependency resolutions invalidate the corresponding audit scope.

## Local reproduction results

### Setup and execution controls

These runs used the approved sibling workspace:

```text
/Users/leonardo/Repositories/meteor/repro-14655/
  app/         # pinned upstream fixture; generated sources/dependencies ignored
  artifacts/   # run logs, summaries, memory samples, output bundles, saved inputs
```

The fixture remained at `1b5049829f27ad51ce6508c0d4419367d490e82b`. The actual
build executable was `/Users/leonardo/Repositories/meteor/meteor/meteor`, which
is the executable called by the core checkout's `.envrc` `@meteor` function.
It ran from the fixture directory and explicitly reported that the checkout
overrode the fixture's Meteor 3.5 release. The first seven runs used checkout
`bd99bb206c`; runs 8–10 used `5306673fe5`, whose intervening change was the
investigation report. There were no build-system code edits during these runs.

- Runtime: development-bundle Node `v24.15.0`, macOS arm64, 32 GiB physical RAM.
  Disk availability at setup was approximately 214 GiB. The host was already
  using compressed memory, so these are host-specific observations.
- App dependencies: `npm ci --ignore-scripts --no-audit --no-fund` completed;
  `npm_config_ignore_scripts=true` remained set during builds. npm reported a
  deprecation warning for `uuid@8.3.2`.
- Installed-hook follow-up: SWC's postinstall validates its native binding and
  can install a WASM fallback on failure. The matching arm64 native package was
  already present, so the hook stayed skipped. Installed `fsevents@2.3.3` had no
  install script or `binding.gyp`, despite the lockfile flag; its prebuilt binary
  was present. This does not constitute an audit of native binary contents.
- Tool flags: `--max-old-space-size=2048`; `METEOR_PROFILE=1` enabled profiling.
  Traced runs additionally loaded the external `artifacts/trace.cjs` and enabled
  `METEOR_TEST_PRINT_LINKER_CACHE_DEBUG=1`.
- A reviewed external Python monitor launched each build in its own process
  group, sampled descendants every 0.5 seconds, and recorded exit code/signal,
  tool RSS, and summed process-tree RSS. It used a 900-second timeout and a
  sampled 6,144 MiB process-tree RSS termination threshold. This is a sampled
  guard, not a hard OS allocation limit. Smoke and timeout tests passed.
- Each build wrote to a distinct `artifacts/<run-id>/output` directory. The
  unsafe upstream `bench.js` was not used. No failed build was terminated by
  the monitor's timeout or memory threshold.
- Compiler and Rspack caches were retained between runs. The explicitly
  fresh-linker-cache runs, including all three cache-isolation follow-ups, moved only `.meteor/local/bundler-cache/linker` into
  saved artifact directories before execution. They were not fully cold builds.

Checkout package selection messages recorded these newer core versions:
`babel-compiler@7.15.0`, `ddp-client@3.4.0`, `ddp-server@3.4.0`,
`ecmascript@0.19.0`, `minifier-js@3.3.0`, `rspack@1.2.1`,
`socket-stream-client@0.7.1`, `tools-core@1.2.0`, `typescript@5.11.0`, and
`webapp@2.3.0`. The npm adapter remained locked to `@meteorjs/rspack@2.1.0`
with Rspack core/CLI `1.7.12`. These are checkout results, not a reproduction
against the original published Meteor 3.5 package set.

### Build matrix actually executed

MiB values below are sampled maxima, not exact peaks. "Both" means
`web.browser` and `web.browser.legacy`; Cordova was excluded throughout.
`normal` means no Meteor `--debug` flag. Cache differences and instrumentation
mean these timings are not controlled performance comparisons.

| Run ID | Modules × functions | Targets / mode | Linker cache | Result | Seconds | Tool RSS MiB | Tree RSS MiB |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| `small-modern-normal` | 20 × 50 | Modern / normal | Initial fixture run | Exit 0 | 47.66 | 1347.59 | 1347.59 |
| `small-legacy-debug` | 20 × 50 | Both / debug | Retained | Exit 0 | 20.97 | 1191.80 | 1191.80 |
| `medium-legacy-debug` | 200 × 400 | Both / debug | Retained; changed generated input | Exit 0 | 31.64 | 2628.45 | 2628.45 |
| `large400-legacy-debug` | 400 × 400 | Both / debug | Retained; changed generated input | Heap OOM, SIGABRT (6) | 68.14 | 3553.09 | 3553.09 |
| `large400-modern-debug` | 400 × 400 | Modern / debug | Retained after failure | Exit 0 | 15.30 | 1475.58 | 2496.33 |
| `large400-legacy-debug-trace` | 400 × 400 | Both / debug + trace | Fresh linker cache | Heap OOM, SIGABRT (6) | 66.99 | 3717.41 | 3717.41 |
| `large400-modern-debug-cold` | 400 × 400 | Modern / debug + trace | Fresh linker cache | Exit 0 | 18.10 | 2566.59 | 2566.59 |
| `large400-legacy-only-debug-cold` | 400 × 400 | Legacy only / debug + trace | Fresh linker cache | Exit 0 | 72.71 | 3897.78 | 3897.78 |
| `large400-both-debug-tree-bypass` | 400 × 400 | Both / debug + trace + tree bypass | Fresh linker cache | Exit 0 | 21.31 | 2574.62 | 2574.62 |
| `large400-both-debug-warm-baseline` | 400 × 400 | Both / debug + trace | Fresh linker cache; other caches warm | Heap OOM, SIGABRT (6) | 13.11 | 2697.20 | 2739.59 |

The first modern-only 400-module pass could benefit from the failed run's cached
modern result. The fresh-linker-cache modern pass removes that specific
confounder. Across these first ten runs, the failure occurred three times:
once without tracing,
once with tracing, and again when normal tree caching was restored after a
successful bypass run. This is not yet a statistical reliability study.

### Artifact and runtime validation

The seven successful bundles in this initial matrix contained the expected browser architecture
directories. The small debug output had 48 JS manifest entries and 19 source-map
references per browser architecture. The small normal production output had one
JS manifest entry and no map reference; source-map availability differs by mode.

The small normal production bundle was started on loopback with the development
bundle's server dependencies supplied through `NODE_PATH`. A headless Chromium
check observed `__CLIENT_BOOTED__ === true`, 20 modules, 20 registry entries,
1,000 functions, and zero page errors. The server and browser were stopped after
the check. The initial browser launch attempt used a nonexistent executable
filename; correcting it to the installed `chrome-headless-shell` allowed the
check to pass. No app failure was involved in that correction.

A browser check of the large debug bypass bundle did not complete: waiting for
the client boot condition timed out after 15 seconds. Its server log contains
the greeting, but no `runtime-check.json` was produced. This is unresolved;
neither successful client execution nor an app defect is established. Larger
bundles still lack successful browser/runtime validation and mapping-position
correctness checks. No full repository test suite was run.

The failing 400-module Rspack outputs were preserved under
`artifacts/large400-legacy-debug/inputs/`:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `client-rspack.js` | 8621197 | `d1288876dfb6f9427d1b2b76f99a1df7522dfe2f3a51c762c24231d1f2f34f9d` |
| `client-rspack.js.map` | 53343815 | `835f5867c91b98dee81243cf3c49d4988f3ed8b50e85e426a390dfeab6f4131e` |

These are the raw Rspack artifacts, not the later legacy-transpiled code/map.
The passing 200-module raw artifacts were also saved in that run's `inputs/`.

### Localized failing operation

`artifacts/large400-legacy-debug-trace/build.log` records the following sequence:

| Stage | Code length | Heap used MiB | RSS MiB |
| --- | ---: | ---: | ---: |
| Modern `fromStringWithSourceMap` starts | 8621197 | 279.02 | 630.61 |
| Modern `fromStringWithSourceMap` returns | 8621197 | 1179.67 | 1609.34 |
| Modern `toStringWithSourceMap` returns | 8623601 | 1449.80 | 2214.25 |
| Legacy `fromStringWithSourceMap` starts | 17658034 | 1269.09 | 3273.41 |
| Legacy expansion | No return logged | V8 heap exhaustion | SIGABRT |

Immediately before the legacy entry, the linker logs
`LINKER CACHE MISS: null web.browser.legacy`. The entry stack points to
`tools/isobuild/linker.js:759` in the baseline source, called through `_chunkifyModuleTrees`,
`getPrelinkedFiles`, `fullLink`, and `PackageSourceBatch._linkJS`.
The next recorded outcome is:

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

This confirms the local failure occurs during legacy source-node expansion,
after modern expansion/recomposition has succeeded. Native stack frames include
JS-to-WASM wrappers, but the observed fatal condition is JavaScript heap
exhaustion, not `RuntimeError: unreachable`.

The inspected `source-map@0.7.4` implementation iterates decoded mappings through
WASM callbacks and creates source nodes in JavaScript. That explains why WASM
frames can accompany a JS heap OOM. The immediate modern expansion added about
901 MiB of heap for this input. Legacy expansion began with over 1.2 GiB already
in use. Retention of the modern expanded tree by the architecture-keyed
`optimism` cache was initially a source-supported hypothesis; the subsequent
intervention below supplies controlled behavioral evidence. Retained-object
measurements remain outstanding.

### Cache-isolation follow-up

Runs 8–10 reused the same 400 × 400 generated input, 2 GiB old-space limit,
trace instrumentation, and retained compiler/Rspack caches. Each started with a
fresh linker disk cache. The external `artifacts/bypass-tree-cache.cjs` preload
matched the linker's `optimism` wrapper and returned no cache key for source
files at least 1 MiB long. It preserved the linking operation but omitted those
large expanded trees from that cache. The cutoff and wrapper matching are
fixture-specific diagnostics, not a proposed production policy.

| Control | Legacy expansion start heap MiB | Legacy expansion end heap MiB | Outcome |
| --- | ---: | ---: | --- |
| Legacy only, normal tree cache | 341.69 | 1222.12 | Complete build |
| Both targets, large-tree cache bypass | 391.65 | 1342.20 | Complete build |
| Both targets, normal tree cache restored | 1396.96 | No return | Heap OOM |

The legacy-only pass shows this input's legacy expansion can complete within
the configured heap when modern processing does not precede it. The bypass
allows the two-target build to complete without changing the generated input or
heap limit. Restoring normal caching reproduces the failure despite warmed
compiler/Rspack caches; its trace again stops inside legacy source-node
expansion. Together these controls strongly implicate cross-architecture
retention of expanded trees in the local failure. They do not quantify retained
objects, establish repeated-run statistical confidence, or reproduce the
upstream WASM trap and oversized-serialization failures.

The legacy-only run's sampled peak RSS is higher than the failing baseline's
RSS. This is consistent with the failing resource being the JavaScript heap
limit rather than a fixed RSS limit. Lower RSS is not a prerequisite for this
control to establish that legacy-only linking can finish.

`artifacts/large400-both-debug-tree-bypass/output-comparison.json` records
byte-identical app output against each target's independent passing control:

| Target / file | Control | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Modern `app.js` | `large400-modern-debug-cold` | 8623627 | `763a268bd6fb0530501610cb8291d0d8c7be3715404a5f9eb91688cc0978a028` |
| Modern `app.js.map` | `large400-modern-debug-cold` | 50466112 | `949769a4b4a3533b5694cd3021fab539f94414cf94bf2b52c20ecd59f2015d29` |
| Legacy `app.js` | `large400-legacy-only-debug-cold` | 17660464 | `147f3bf38993210db8e49c076f2a597dd85f6caf19aa7c61f9caf4e9c70ce2ee` |
| Legacy `app.js.map` | `large400-legacy-only-debug-cold` | 50499987 | `b9e9cd404a1f7d2107fb55bdb02cc0bb1eb5242d84c3b5ae5049fc0bb407f8f4` |

This comparison covers these four app files, not every bundle resource. It
supports output preservation for this diagnostic intervention. It does not
independently verify that either control's source mappings are correct or that
the large debug application boots in a browser.

### Checkout-local probes (September 5 follow-up)

At the user's request, `tools/isobuild/linker.js` now calls the small
`tools/isobuild/linker-memory-trace.js` logger. Enable it with
`METEOR_LINKER_MEMORY_TRACE=1`; other values disable it. Files smaller than
1,048,576 UTF-16 code units are filtered out. Events use the `[linker-memory]`
prefix and JSON fields for architecture, source path, code length, map presence,
cache entry count, process uptime, and `process.memoryUsage()` values in bytes.
No map or tree is traversed, serialized, or retained by the logger.

Events are `request`, `compute`, `consumer-start`, `expand-start`, `expand-end`,
and `tree-ready`. The request occurs outside the memoized function; compute
occurs only when the function actually executes. A request without a subsequent
compute can identify reuse in a complete trace; a missing event after a fatal
abort alone cannot. `expand-start` follows consumer construction, `expand-end`
precedes consumer destruction, and `tree-ready` follows destruction and wrapper
construction. Cache counts cover all entries, including small files whose events
are filtered; optimism inserts the current entry before compute executes.

Two further 400 × 400 builds used these probes, the same 2 GiB old-space limit,
fresh linker disk caches, retained compiler/Rspack caches, and the existing
900-second / 6144-MiB sampled guard. Neither used `trace.cjs`. Source was
`5306673fe5` plus the checkout probe changes in this report's associated commit.

| Artifact directory | Intervention | Result | Wall seconds | Peak tool/tree RSS MiB |
| --- | --- | --- | ---: | ---: |
| `large400-both-checkout-probes` | Checkout tracing only | Heap OOM, SIGABRT (6) | 14.94 | 2632.81 |
| `large400-both-checkout-probes-bypass` | Checkout tracing + existing external cache bypass | Exit 0 | 20.74 | 2800.73 |

Neither guard triggered. The exact build command is stored in each summary;
`METEOR_LINKER_MEMORY_TRACE=1` was additionally set for both (the existing
monitor's environment allowlist does not capture this new variable).

| Checkout probe | Normal cache heap bytes | Bypassed large-tree cache heap bytes |
| --- | ---: | ---: |
| Modern expansion start | 343895544 | 338054408 |
| Modern expansion end | 1242509528 | 1236078864 |
| Legacy expansion start | 1345577816 | 550942544 |
| Legacy expansion end | No return before OOM | 1350536920 |

The ordinary cache count goes from 194 at modern request to 195 at compute,
and from 665 to 666 at legacy request/compute. With bypass, those pairs remain
194/194 and 664/664. These events verify that the intervention avoids creating
the two large cache entries. They do not directly measure retained object bytes.
The approximately 758 MiB lower heap at legacy entry and completed expansion
support the same cache-retention explanation as the preload experiments.

`large400-both-checkout-probes-bypass/output-comparison.json` records direct
byte comparisons of both architectures' `app.js` and `app.js.map` against
`large400-both-debug-tree-bypass`. All four match the byte lengths and SHA-256
hashes in the preceding table. Browser correctness remains subject to the
previously recorded large-debug timeout; no new runtime pass is claimed.

Verification: the two focused tests in
`tools/isobuild/linker-memory-trace.node-test.js` passed with
`dev_bundle/bin/node --test tools/isobuild/linker-memory-trace.node-test.js`.
They check disabled mode (including a memory-sampling spy), filtering,
structured metadata, and omission of source/map contents. The tests initially
failed before implementation. The isolated Jest dependencies were absent;
no dependency installation or full test suite was needed for these probes.
An independent source review found no cache/key/output mutation or retained
source references. Timing/log allocation overhead exists when enabled; heap
samples include unrelated live allocations and garbage awaiting collection.
No forced GC, retained-tree sizing, statistical performance claim, or production
fix is implied. Unset the variable to disable tracing, or revert the probe commit.

### Comparing experimental cache policies

The comparison evaluates three candidate interventions against the original
4,096-entry tree cache. No production policy has been selected. The opt-in
[experiment preload](experiments/cache-policy-preload.cjs) applies
[policy wrappers](experiments/cache-policies.cjs) to the bundled `optimism`
implementation; the normal tool does not load them. The comparison used source checkout `057d48492b` plus these experiment files.
The preload requires
`METEOR_LINKER_CACHE_EXPERIMENT` to select a known policy, matches the intended
linker wrapper, and reports its match and interventions. A failed or ambiguous
match must not be treated as a valid candidate run.

| Policy | Experimental behavior | Limitations and possible cost |
| --- | --- | --- |
| `baseline` | Retain the existing 4,096-entry cache behavior through the same preload machinery. | Provides a common instrumented control; does not constrain retained bytes. |
| `bypass-large` | Return no cache key for source text of at least 1,048,576 UTF-16 code units. Preserve smaller entries and existing `disableCache` handling. | Source length is an imperfect proxy for map/tree cost; small dense maps can be expensive. Large files lose reuse even when they would fit comfortably. The cutoff is experimental. |
| `cap-128` | Reduce the wrapper's maximum entry count from 4,096 to 128. | Count is not a byte budget. A few large trees can still exhaust memory; reducing entries can also evict useful small results and increase recomputation. |
| `rotate-arch` | On a change between defined architecture strings, forget keys tracked during the preceding interval. Undefined-architecture calls do not establish a new target, but their keys are tracked. | Assumes useful architecture locality. Interleaved targets can cause repeated eviction and duplicate pending work. Tracking keys is not bounded until a transition, and cache-key calculation acquires eviction side effects. |

Rotation uses `forgetKey` so optimism can dispose dependency relationships. It
does not cancel work already in flight; current callers retain their promises.
The focused pending-work test checks result preservation while demonstrating
that an architecture switch can duplicate computation. These properties make
rotation a diagnostic candidate requiring a more deliberate lifecycle design
before any production adoption, even if it produces favorable build numbers.

The [comparison runner](experiments/compare-cache-policies.py) defines this
methodology:

- Generate the procedural fixture once per workload, keeping `FUNCS=400`.
- Run `400 × 400` twice per policy, reversing the policy order on the second
  pass. Run a smaller `200 × 400` comparison once per policy afterward. These
  small sample counts can reveal obvious regressions, not establish statistical
  performance confidence or eliminate host/cache warm-up effects.
- Use a fresh process and move the linker disk cache aside before every build.
  Retain compiler and Rspack caches. Use both browser targets, exclude Cordova,
  build with `--debug`, retain the 2 GiB old-space limit, and enable the same
  checkout linker tracing for all policies. The external monitor keeps the
  900-second timeout and 6,144 MiB sampled process-tree guard.
- Record policy events, linker events, exit/signal, sampled RSS, and duration in
  each run's `comparison.json`, alongside the monitor artifacts. Distinguish
  completion, the recognized heap-OOM signature, unexpected failure, and guard
  termination. Verify that the intended policy matched exactly once.
- Compare successful 400-module outputs against
  `large400-both-debug-tree-bypass`, byte for byte, for both targets' `app.js`
  and `app.js.map`. The smaller comparison must use a matching 200-module
  passing control. Require all four expected files; equality covers these app
  files, not all resources, source-map semantics, or browser execution.

Nine focused policy tests passed against the development bundle's actual
`optimism` implementation using
`dev_bundle/bin/node --test dev/modern-tools/rspack/experiments/cache-policies.node-test.cjs`.
They cover per-policy reuse/disable behavior, the source-length boundary,
entry-count eviction, architecture transitions including undefined targets,
pending-work results, and invalid-policy rejection. These tests verify the
experimental policy mechanics rather than establish production fitness.

Interpret heap snapshots cautiously: `heapUsed` at expansion entry includes
objects that may already be unreachable but have not yet been collected.
Evicting cache entries need not immediately reduce that number. A successful
expansion can end with less heap than it started with if garbage collection
reclaims earlier trees while allocating the new one. Entry/end samples cannot
measure a tree's retained size or its gross allocation volume; controlled
outcomes and cache events supply different evidence from these snapshots.

#### Completed 400-module comparison

All eight runs completed under `artifacts/cache-policy-comparison-400/`.
Execution order was baseline, bypass, cap, rotation in the first pass, then
rotation, cap, bypass, baseline in the second. All matched their intended
preload exactly once. Both baseline runs ended with V8 heap OOM and SIGABRT;
all six candidate runs exited successfully. No resource guard triggered.

The table reports sampled maxima. Tool and process-tree RSS maxima were equal
for these eight runs, so they share a column. Failed baseline durations end at
the crash and must not be treated as faster completed builds.

| Policy / repeat | Result | Seconds | Peak tool/tree RSS MiB | Legacy expansion start heap MiB | Legacy expansion end heap MiB |
| --- | --- | ---: | ---: | ---: | ---: |
| `baseline-1` | Heap OOM, SIGABRT | 13.10 | 2799.58 | 1392.70 | No return |
| `baseline-2` | Heap OOM, SIGABRT | 13.74 | 2751.77 | 1392.80 | No return |
| `bypass-large-1` | Exit 0 | 21.28 | 3004.45 | 519.96 | 1293.58 |
| `bypass-large-2` | Exit 0 | 21.96 | 2766.06 | 521.32 | 1305.19 |
| `cap-128-1` | Exit 0 | 21.85 | 2954.59 | 1390.54 | 1285.43 |
| `cap-128-2` | Exit 0 | 21.85 | 2941.78 | 1390.11 | 1285.03 |
| `rotate-arch-1` | Exit 0 | 21.29 | 2766.52 | 1392.98 | 1287.15 |
| `rotate-arch-2` | Exit 0 | 21.85 | 2905.02 | 1393.31 | 1287.04 |

Every successful run compared both targets' `app.js` and `app.js.map` with the
previous 400-module bypass control: all 24 comparisons across six runs were
byte-identical, with the same lengths and hashes already listed above. These
remain output equivalence checks, not new browser or mapping-semantics passes.

All three interventions remove the failure for this workload in both orders.
That supports reducing expanded-tree retention as a useful direction, but does
not select the best production policy. Successful durations cluster between
21.28 and 21.96 seconds, and sampled RSS varies within and across policies; two
runs are insufficient to rank these candidates confidently by speed or memory.

The cap and rotation results also refine the heap interpretation. They enter
legacy expansion with roughly 1,390–1,393 MiB of heap, similar to the failing
baseline, yet finish with roughly 1,285–1,287 MiB. Their caches have released
references, allowing garbage collection during expansion. An entry sample
alone cannot establish live retention or predict failure. The bypass reaches
legacy expansion with roughly 520–521 MiB already in use and also completes.
No retained-object snapshot quantifies the modern tree's exact live size.

Rotation logs show the modern-to-legacy transition reducing the cache from
197 entries to zero and the legacy-to-server transition from 471 to zero in
both repeats. Cap-by-count and bypass-by-source-length remain proxies with the
limitations above. The result does not demonstrate that 128 entries or the
1 MiB code-unit threshold is appropriate across real applications.

#### Completed 200-module comparison

All four policies completed the single-pass `200 × 400` comparison under
`artifacts/cache-policy-comparison-200/`, using the same build controls and
fresh linker disk cache for each run. The output control was the earlier
`medium-legacy-debug` build. All 16 app code/map comparisons were byte-identical;
no resource guard triggered.

| Policy | Result | Seconds | Peak tool/tree RSS MiB | Legacy expansion start heap MiB | Legacy expansion end heap MiB | Profiled SWC compile ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `baseline`, first | Exit 0 | 29.43 | 3091.97 | 893.62 | 1167.07 | 14,042 |
| `baseline`, repeat after candidates | Exit 0 | 29.98 | 3136.98 | 910.60 | 1197.06 | 14,015 |
| `bypass-large` | Exit 0 | 28.86 | 2519.75 | 892.33 | 729.19 | 14,080 |
| `cap-128` | Exit 0 | 28.32 | 2488.89 | 892.74 | 713.07 | 14,069 |
| `rotate-arch` | Exit 0 | 29.50 | 2490.53 | 892.99 | 714.29 | 14,148 |

All four profiles record one SWC compilation taking approximately 14 seconds.
An initial suspicion that only the first baseline paid compiler warm-up cost is
not supported: retaining compiler/Rspack caches did not avoid that recorded work
in the later candidate runs. The reason for recompilation is not established.
The 28.32–29.50-second build durations do not establish a speed ranking.

The smaller baseline already passes. Candidate sampled peak RSS is lower in
this pass, and their legacy expansion ends with less heap than it starts with,
consistent with allowing earlier allocations to be collected. A single run per
candidate does not establish a repeatable memory advantage or rule out runtime,
map-correctness, incremental-rebuild, or application-specific regressions.

The extra baseline repeat under
`artifacts/cache-policy-comparison-200-repeat-baseline/` also passed with four
byte-identical outputs and no guard termination. It again performed about
14 seconds of SWC compilation. Across these five smaller runs, candidate RSS
was 2488.89–2519.75 MiB versus baseline 3091.97–3136.98 MiB. This is an observed
reduction of roughly 19–21%, not a general memory guarantee. These are MiB:
approximately 2.43–2.46 GiB versus 3.02–3.06 GiB.

#### Interpretation, recommendation, and reproducibility

Across the full comparison, 13 builds produced 11 successes and the two expected
baseline heap failures. All 44 app JavaScript/map comparisons matched. No guard
triggered. The fixture was restored to `400 × 400` after the smaller tests.
`artifacts/cache-policy-comparison-summary.json` aggregates all runs, expansion
timings, SWC profile times, source revision, and SHA-256 hashes of the harness
and linker instrumentation. Per-run `comparison.json` files preserve raw events.

At 400 modules, candidate modern source-node expansion took 700.87–774.99 ms;
successful legacy expansion took 703.71–794.09 ms. At 200 modules in the four-policy
pass, modern expansion took 341.26–350.90 ms and legacy 332.58–352.65 ms. These
intervals include any GC during expansion and exclude consumer construction and
later serialization. The candidates release cached references; none eliminates
the cost or peak allocation of constructing the current source-node tree.

**Recommended next experiment:** explicit disposal of expanded-tree cache
entries at the production architecture boundary. It avoids using source length
or incidental file count as the sole retention policy and can preserve reuse
within the current target. The global `makeCacheKey` rotation used here is not
ready to ship: disposal should be tied to a real lifecycle boundary, with
interleaved/concurrent callers and development rebuild reuse tested. Keep the
large-entry admission bypass as the narrower alternative and benchmark it on
mapping-dense inputs. Do not select a 128-entry cap solely because this fixture
passes; the tests demonstrate that it still retains large entries while fewer
than 128 keys exist.

This is a prioritized implementation direction, not selection of a production
patch or a demonstrated speed winner. Incremental rebuilds, normal minified
builds, dense maps in small files, and other application shapes remain untested.
The earlier large-debug browser timeout remains unresolved. Neither the WASM
trap nor real oversized-cache serialization has been reproduced here.

To repeat the guarded 400-module matrix from the core checkout, choose an unused
`--label`; the runner preserves prior results and refuses an existing directory:

```bash
python3 dev/modern-tools/rspack/experiments/compare-cache-policies.py \
  --fixture /Users/leonardo/Repositories/meteor/repro-14655/app \
  --artifacts /Users/leonardo/Repositories/meteor/repro-14655/artifacts \
  --monitor /Users/leonardo/Repositories/meteor/repro-14655/artifacts/monitor.py \
  --control /Users/leonardo/Repositories/meteor/repro-14655/artifacts/large400-both-debug-tree-bypass \
  --modules 400 --repeats 2 --label cache-policy-comparison-400-new
```

The runner requires the pinned fixture and previously prepared monitor/control;
it is an investigation harness, not a standalone benchmark distribution. The
200-module run used `--modules 200 --repeats 1` and the `medium-legacy-debug`
control. Changing workloads regenerates ignored fixture files. Disable the
preload to restore the baseline; the default checkout does not load any candidate.

### Evidence locations and next checks

Each run directory contains `summary.json`, `samples.jsonl`, and `build.log`;
successful builds also contain `output/bundle`. The loopback result is
`small-modern-normal/runtime-check.json`. `artifacts/monitor.py` and
`artifacts/trace.cjs` preserve the instrumentation used;
`artifacts/bypass-tree-cache.cjs` preserves the cache intervention. Artifacts are local,
untracked investigation data and are not included in the core repository commit.

The cache-isolation controls now separate legacy-only completion from the
combined-target failure, and checkout probes reproduce that result. Next,
characterize the legacy map and retained structures, and
resolve the large debug browser timeout before claiming runtime correctness.
Do not jump to the 800/3200-module workloads: a smaller reproducible failure
is already available.

The WASM `unreachable` and real oversized-cache serialization failures remain
unreproduced. No replacement library, cache-format change, production cache
policy fix, or production dependency change has been implemented. The external
cache bypass is an experimental intervention only.

## Proposed experiment sequence and acceptance criteria

The original sequence below remains a reference for further experiments. Its
passing-control and repeatable-heap-failure milestones have now been met as
recorded above; the full correctness/performance matrix and later failure
signatures remain outstanding. Do not start with a replacement library and
infer the baseline afterward.

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

No built-app runtime interface, production dependency, or cache format changes.
The tool emits additional diagnostics only when tracing is enabled. The report
records the external investigation and opt-in checkout probes, not a production
fix. External fixture dependencies and generated artifacts now exist in the
sibling workspace. Documentation rollback is a normal revert
of its commit; no data migration or deployment recovery is required. Cleanup of
the sibling workspace is separate and should preserve any desired logs/inputs.

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
