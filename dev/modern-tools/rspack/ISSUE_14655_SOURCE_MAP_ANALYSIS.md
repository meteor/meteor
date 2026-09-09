# Issue 14655 source-map scalability analysis

## Purpose

This document records the original failure analysis and the production
file-backed source-map engine implemented on
`investigation/14655-rspack-build-memory`. It also compares correctness,
memory, and time before and after the change.

The analysis compares the branch against `upstream/devel` and incorporates the
reporter's direct test of the real generated output: approximately 68 MB of
JavaScript with a 418 MB source map, under a 2 GiB V8 old-space limit.

## Executive conclusion

The reporter's analysis was correct: compact leaves acted after the failing
WASM decoder. The completed change now keeps large Rspack maps file-backed and
composes them in a purpose-built Rust helper. The `3200 x 400` debug build
completes under the same 2 GiB V8 heap cap that makes the old implementation
fail with `RuntimeError: unreachable`.

```text
Original large-input result

raw map
  |
  v
WASM-backed decoding and eachMapping
  |
  X  RuntimeError: unreachable
  |
  v
compact leaves                         never reached
```

The optional linker cache and final client-map writer also avoid monolithic
`JSON.stringify` calls for file-backed maps. A production-mode run at this
artificial scale now gets past source-map composition but later exhausts the
2 GiB heap in the standard JavaScript minifier. That is a separate remaining
boundary, documented below.

The investigation also identified cache writers and the final map writer that
constructed very large monolithic JSON strings. The implemented file-backed
path bypasses or streams those boundaries as described below.

## Reproduction on the branch

The failure was reproduced locally on 2026-09-09 from reporter fixture commit
`23abf28c53a54988fe1323d3b7b384d7eb1540f2`. The procedural generator was run
with `MODULES=3200 FUNCS=400`, producing 3,200 modules containing 1,280,000
functions. Rspack then produced these artifacts:

```text
client-rspack.js       71,216,955 bytes   (67.918 MiB)
client-rspack.js.map  437,865,446 bytes   (417.581 MiB)
map sources                 3,202
map SHA-256            53eabf91ddd53254b4d75453df338c9dd41645f6cb24a79f62c4bf2e1ddddd09
```

The reporter's isolated harness was run with the checkout's Node 24.15.0,
`source-map@0.7.4`, and `--max-old-space-size=2048`. It completed the small
control and trapped on the real map:

```text
{"label":"small (control)","completed":true,"mappings":3,"peakRssMB":47}
big map: 3202 sources, 418MB
{"label":"big (real repro map)","completed":false,"error":"unreachable","peakRssMB":2203}
```

The equivalent end-to-end command was then run against this checkout:

```sh
TOOL_NODE_FLAGS='--max-old-space-size=2048' meteor build --directory /tmp/out
```

Meteor synchronized the temporary app to `@meteorjs/rspack@2.2.0`. Rspack
successfully compiled the same 67.918 MiB client asset, after which linking
failed with this relevant call chain:

```text
BasicSourceMapConsumer._parseMappings
  -> BasicSourceMapConsumer.eachMapping
     -> fromStringWithSourceMap (tools/isobuild/compact-source-node.ts:166)
        -> PackageSourceBatch._linkJS
           -> ClientTarget.make
              X RuntimeError: unreachable
```

The identical map size and SHA-256 before and after the full build show that
the isolated test exercised the same Rspack artifact consumed by the linker.
No compact mapped leaf was returned before the trap.

```text
3200 modules x 400 functions
              |
              v
       Rspack completes
              |
              +--> 67.918 MiB JavaScript
              `--> 417.581 MiB source map
                           |
                           v
                 source-map WASM parser
                 eachMapping / _parseMappings
                           |
                           X  RuntimeError: unreachable
                           |
                  compact leaf allocation
                       never reached
```

## Effective branch change

Against `upstream/devel`, the branch's production behavior changes only the
mapped leaf representation used during prelinking. The linker still constructs
a `SourceMapConsumer`, but calls the local `fromStringWithSourceMap` helper
instead of `SourceNode.fromStringWithSourceMap`.

```text
Before

SourceMapConsumer
  |
  v
SourceNode.fromStringWithSourceMap
  |
  `-- ordinary SourceNode for every mapped fragment
      |-- children array
      |-- sourceContents object
      `-- location and code fields

After

SourceMapConsumer
  |
  v
local fromStringWithSourceMap
  |
  `-- CompactMappedLeaf for every mapped fragment
      |-- direct location and code fields
      |-- no children array
      `-- no per-leaf sourceContents object
```

Root and wrapper nodes remain ordinary `SourceNode` instances. The compact
leaf implements only the traversal behavior used by linking, HMR composition,
and source-map serialization. It is deliberately not a general replacement
for the mutable `SourceNode` API.

The linker also destroys the caller-owned consumer in `finally`. This improves
cleanup for ordinary thrown errors, but it cannot turn a failed decode into a
successful build.

## What compact leaves successfully address

The original investigation reproduced a smaller two-architecture failure at
`400 x 400`. The modern expanded tree remained cached while the legacy target
began its own expansion. With ordinary leaves, the retained modern tree left
too little old-space headroom for legacy linking.

```text
Modern target                       Legacy target

expand ordinary tree
  |
  +-- tree retained in optimism cache
  |       ~918 MiB held in isolated measurement
  |
  `------------------------------------+
                                       v
                                 expand legacy tree
                                       |
                                       X heap OOM
```

The isolated compact representation reduced held heap from approximately
918 MiB to 276 MiB for the captured raw modern input. Full `400 x 400` debug
builds with both browser targets then completed under the same 2 GiB old-space
limit, and their emitted JavaScript and maps were byte-identical to the passing
controls.

That is meaningful evidence for the compact representation. It demonstrates a
real reduction in expanded-tree retention; it does not establish that decoding
arbitrarily large maps is safe.

## Why the compact-leaf-only version failed at the largest scale

The earlier compact-leaf helper copied the segmentation algorithm from
`source-map@0.7.4`,
including its iteration contract:

```ts
aSourceMapConsumer.eachMapping(function (mapping) {
  // Split generated code and create a compact leaf.
});
```

The sequence is therefore:

```text
1. Parse the source-map object
2. Construct SourceMapConsumer
3. Decode and iterate mappings through eachMapping
4. Invoke the JavaScript callback for each decoded mapping
5. Split generated code into mapped fragments
6. Allocate compact leaves
```

The reporter's real `3200 x 400` run failed at step 3. That version optimized
step 6. Reducing the size of an object that had not yet been allocated could
not help the earlier decoder complete.

This also explains why small procedural tests pass. Their largest generated
fixture uses 1,000 mappings, which is appropriate for semantic parity but does
not stress the WASM decoder at hundreds of megabytes.

## Distinct failure boundaries

The build should be understood as a chain of independent resource boundaries:

```text
Rspack output: code + encoded map
  |
  v
[1] SourceMapConsumer / eachMapping
  |     largest reporter input fails here
  v
[2] Expanded prelink tree
  |     compact leaves improve this stage
  v
[3] SourceMapGenerator / toStringWithSourceMap
  |     output generator still has substantial state
  v
[4] Linker disk-cache JSON.stringify
  |     code and maps serialized together
  v
[5] SWC disk-cache JSON.stringify
  |     compilation serialized as one string
  v
[6] Final source-map JSON.stringify
  |     complete map serialized for output
  v
successful archive
```

A fix at one boundary must not be treated as proof that later boundaries are
safe.

## Linker disk-cache boundary

`PackageSourceBatch#_linkJS` creates a resource array whose entries include
string code and parsed source-map objects. When disk caching is enabled, it
serializes the entire array at once:

```js
retAsJSON = JSON.stringify(ret);
```

```text
resource 1 code + map
resource 2 code + map
resource N code + map
          |
          v
one JSON.stringify call
          |
          v
one enormous UTF-16 JavaScript string
```

The operation has no size-aware fallback. JSON syntax and escaping can make
the result larger than the source files. Increasing V8 old space does not
raise V8's separate maximum string-length limit.

## SWC cache boundary

The second reported cache site is inside the `babel-compiler` package, but the
current function is specifically the SWC disk-cache writer:

```js
await fs.promises.writeFile(
  cacheFilePath,
  JSON.stringify(compilation),
  'utf8',
);
```

Its asynchronous helper is invoked without `await` or `.catch()`. A
serialization failure therefore becomes an unhandled rejection; the outer
synchronous `try/catch` cannot catch it.

```text
synchronous try
  |
  `-- call async writeFileCache() without await
          |
          `-- JSON.stringify throws later
                  |
                  `-- rejected promise escapes try/catch
```

Making this optional cache failure recoverable is necessary, but it would not
repair the earlier WASM failure or the linker cache.

## Final-output boundary

The bundler ultimately performs `JSON.stringify(file.sourceMap)` before writing
the `.map` file. This is not a cache: it is part of producing the requested
archive output. Skipping optional caches is consequently insufficient if the
map itself eventually exceeds the runtime's single-string limit.

For the reported 418 MB map, the exact final-output result depends on whether
that number measures UTF-8 file bytes or JavaScript code units and on how much
escaping the in-memory object requires. The boundary is source-verified but
has not been independently reproduced with the reporter's artifact in this
checkout.

## Plain-JavaScript decoding versus encoded-map composition

The reporter proposed decoding the raw `mappings` string in JavaScript instead
of using `consumer.eachMapping`. This moves the intervention before the failing
WASM boundary:

```text
raw mappings string
  |
  v
incremental JavaScript VLQ decoder
  |
  v
compact leaves
```

This is the narrowest continuation of the current design. It preserves the
compact tree and existing downstream `SourceNode` composition, but still
creates a fragment tree and later generator state.

An `@zodern/source-maps`-style design is more fundamental:

```text
input encoded mappings
  |
  +-- decode only boundary information
  +-- adjust the few mappings affected by offsets
  `-- copy most encoded mappings directly
          |
          v
output encoded mappings
```

That avoids fully decoding, storing, and re-encoding every mapping. It is not a
drop-in replacement for every existing contract. Its documented constraints
include unsupported indexed input maps, no input column offsets, ordered
non-overlapping inputs, and inputs beginning on new lines. The branch's tests
explicitly cover indexed maps and nested/repeated `SourceNode` composition.

A production design therefore needs either a compatible decoder, or a fast
encoded-map path with a carefully tested fallback for unsupported shapes.

## Recommended solution decomposition

Treat the issue as coordinated but independently verifiable work:

```text
Track A: decoding and composition
  |-- bypass the failing WASM iteration
  |-- preserve mapping semantics
  |-- bound intermediate allocations
  `-- prove the real 3200 x 400 input completes

Track B: cache resilience
  |-- skip or stream oversized optional cache entries
  |-- catch asynchronous cache-write failures
  |-- preserve warm-build correctness
  `-- never change emitted program contents on cache failure

Track C: final output
  |-- avoid requiring an oversized monolithic string
  |-- preserve valid source-map JSON
  `-- verify debugger positions and archive contents
```

Changes to a persisted cache format, a production dependency, or the central
linking architecture require explicit review and an architectural decision.

## Implemented architecture

Large web Rspack maps now cross the Meteor build pipeline as a private,
JSON-safe file descriptor. They are never exposed as a new compiler-plugin
public type. Composition requests contain paths and small metadata; generated
code and maps remain file-backed until their existing output boundary.

```text
Rspack
  |-- client-rspack.js ------------------------+
  `-- client-rspack.js.map                     |
            |                                  |
            v                                  v
   private file descriptor              ordinary code string
            |                                  |
            `---------------+------------------'
                            v
                 Rust helper subprocess
                   |-- mmap input files
                   |-- stream VLQ mappings
                   |-- spool sourcesContent
                   `-- write code + map files
                            |
                            v
                 private file descriptor
                            |
                            v
               Builder streams/copies final map
```

The helper deliberately does not depend on Oxc or Zodern. It implements the
specific `source-map@0.7.4` composition behavior Meteor uses, including basic
and indexed maps, Unicode columns, names, unmapped spans, `sourceRoot`, source
contents, URL normalization, and exact JSON key ordering. Differential tests
use `source-map@0.7.4` as the oracle.

The helper's direct runtime dependencies are `anyhow`, `memmap2`, `serde`,
`serde_json`, and `sha2`; each is dual MIT/Apache-2.0 licensed. `tempfile` is a
test-only dependency with the same license choice. Cargo's locked transitive
dependency set was also checked and contains permissive licenses.

For file-backed inputs, the linker skips both its in-memory and disk caches.
Those descriptors name process-owned temporary files, so persisting them would
create stale paths; embedding the map would recreate the original large-string
failure. Existing non-file-backed cache behavior is unchanged, and the cache
salt was incremented to prevent old entries from bypassing the new path.

`METEOR_USE_LEGACY_SOURCE_MAP_ENGINE=true` is an explicit diagnostic selector.
It restores the prior web Rspack map path and is expected to reproduce the
large-map failure; it is not an automatic fallback that can hide a helper
failure. Missing helpers, invalid protocol responses, oversized diagnostic
responses, and a ten-minute helper timeout fail with actionable errors.

## Before/after measurements

All timed comparisons used reporter fixture commit
`23abf28c53a54988fe1323d3b7b384d7eb1540f2`, Node 24.15.0, a 2,048 MiB V8
old-space cap, and only `web.browser` (legacy browser and Cordova targets were
excluded). Each measured run removed the app build directory and local Rspack
cache. RSS was sampled every 250 ms by process command; times are wall clock
and `METEOR_PROFILE` output.

```text
400 x 400 debug control

                         Before       After       Change
completed                yes          yes         --
wall time                 14.9 s       15.0 s      +0.1 s  (+0.7%)
profile total             13.262 s     13.743 s    +0.481 s (+3.6%)
Meteor peak RSS           1,483 MiB    1,227 MiB   -256 MiB (-17.3%)
helper peak RSS           --           82 MiB      --
final JavaScript          8,623,627 bytes in both runs
final source map          50,466,112 bytes in both runs
```

The control artifacts are byte-identical:

```text
artifact       SHA-256
app.js         763a268bd6fb0530501610cb8291d0d8c7be3715404a5f9eb91688cc0978a028
app.js.map     949769a4b4a3533b5694cd3021fab539f94414cf94bf2b52c20ecd59f2015d29
```

```text
3200 x 400 debug reproduction

                         Before       After
completed                no           yes
termination              WASM trap    clean exit
elapsed                   99.1 s       73.2 s
Meteor peak RSS           2,917 MiB    1,841 MiB
helper peak RSS           --           742 MiB
profile total             incomplete   71.709 s
prelink profile           incomplete   4.193 s
link-JS profile           incomplete   4.308 s
source-map serialization  incomplete   4.073 s
```

The old run has no successful completion time, so a speedup percentage would
be misleading. The new engine produced a complete bundle 25.9 seconds before
the old engine failed. Its final large artifacts were:

```text
artifact       bytes        SHA-256
app.js         71,219,385   d3ec2fca6a6b0849fd842d9717cb98bfafa29c82f78d9abc2a4ed5d621c4eb9a
app.js.map     414,836,143  88089bbed4f3aa5084f3eef9133303d317a36a4228ee3ecc3e381ce18ba76708
```

An additional 4 GiB baseline attempt still trapped in the WASM consumer and
could not produce a large reference artifact. Large-scale byte identity is
therefore supported by differential tests and the byte-identical 400 x 400
end-to-end control, not by a completed old 3200 x 400 build.

The helper initially peaked at 1,039 MiB because JSON unescaping retained all
`sourcesContent` strings. Parsing those entries as borrowed raw JSON and
decoding one source at a time into a disk spool reduced its peak to 742 MiB
without changing the 73-second wall time or output behavior.

## Production-mode boundary after this fix

At `3200 x 400`, a normal production build passed the new source-map stage and
then reached V8's heap limit after 113.5 seconds while processing the standard
minification path. The last completed garbage collection retained about
2,027.5 MiB. This does not reproduce the original WASM `unreachable` failure:

```text
Rspack -> Rust source-map composition -> linked map complete
                                      -> JavaScript minifier
                                                |
                                                X V8 heap OOM at 2 GiB
```

Debug builds, which preserve source maps without production minification, are
the valid before/after measurement of this source-map change. Reducing the
minifier's memory use is separate follow-up work.

## Acceptance criteria for a complete fix

1. The reporter's captured `3200 x 400` code and map pass the replacement
   decoding/composition stage under a 2 GiB old-space limit.
2. A full build with all intended browser architectures completes under that
   limit.
3. Modern and legacy JavaScript outputs match an accepted control.
4. Source-map positions, names, source roots, Unicode columns, unmapped spans,
   source contents, and supported indexed maps remain correct.
5. Optional link and SWC cache writes cannot abort an otherwise valid build.
6. Oversized cache entries are skipped or stored without constructing a string
   beyond the runtime limit.
7. Final `.map` emission remains bounded and produces valid JSON.
8. Cold and warm builds, production and debug modes, dynamic imports, and HMR
   follow their documented behavior.
9. Peak heap/RSS measurements distinguish the Meteor tool from Rspack and other
   child processes.
10. Every skipped check and unsupported fallback is documented explicitly.

Measured status on 2026-09-09:

```text
criterion  status       evidence
1          pass         3200 x 400 debug build completes at 2 GiB
2          partial      web.browser passes; legacy/Cordova were excluded
3          partial      modern 400 x 400 bytes match; legacy not rechecked
4          pass         differential semantic and exact-byte tests
5          pass(path)   file-backed linker cache skipped; SWC path bypassed
6          pass(path)   no file-backed map is serialized into a cache string
7          pass         414,836,143-byte final map streamed to the bundle
8          partial      debug/cold runs covered; production hits minifier OOM
9          partial      tool/helper RSS measured; peak V8 heap inferred from GC
10         pass         skipped checks and residual boundaries listed below
```

## Current evidence and limitations

- Five Rust-engine differential/adapter tests and two Rust unit tests pass.
  Earlier compact-leaf tests remain part of the branch history.
- The `400 x 400` end-to-end JavaScript and source map are byte-identical.
- The `3200 x 400` debug build completes under the requested V8 cap; the old
  path fails at the WASM consumer under both 2 GiB and 4 GiB caps.
- The full-scale run covers an application web bundle. Package linking,
  indexed maps, Unicode columns, and source rewriting have focused coverage;
  HMR and dynamic-import integration do not yet have dedicated end-to-end
  large-map fixtures.
- Server Rspack maps stay on the legacy in-process path. Server `JsImage`
  output embeds a base64 data URL, so making it file-backed while preserving
  exact behavior requires a separate streaming-base64 change.
- File-backed linker results intentionally bypass cache persistence. Ordinary
  map caches retain their prior behavior and format.
- Helper workspaces are registered with Meteor's temporary-directory manager
  and are removed on process exit. A long-running process that performs many
  full rebuilds can retain superseded intermediate files until exit.
- Production minification at the artificial 1.28-million-function scale still
  exceeds a 2 GiB V8 heap after source-map linking succeeds.
- The Jest-based `tools/utils/utils.test.js` could not run in this checkout
  because `tools/unit-tests` has no installed Jest binary. The same descriptor
  sizing path is exercised by the passing adapter and end-to-end builds.

## Review order

1. Review the file-backed descriptor and Rust protocol boundary.
2. Review Rust decoding, URL handling, source-content spooling, and its
   differential tests.
3. Review linker/import-scanner composition and cache bypass behavior.
4. Review final Builder streaming and dev-bundle helper installation.
5. Re-run the small semantic suite before the full reproduction.
6. Treat production minification and streaming server inline maps as separate
   follow-up scopes.
