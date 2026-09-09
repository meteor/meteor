# Issue 14655 source-map scalability analysis

## Purpose

This document explains why the compact mapped-leaf change on
`investigation/14655-rspack-build-memory` improves one source-map memory
problem but does not make the largest `3200 x 400` reproduction complete.
It also separates the failure boundaries that must be addressed before the
issue can be considered fixed.

The analysis compares the branch against `upstream/devel` and incorporates the
reporter's direct test of the real generated output: approximately 68 MB of
JavaScript with a 418 MB source map, under a 2 GiB V8 old-space limit.

## Executive conclusion

The reporter's analysis is correct. The branch reduces memory retained by the
expanded JavaScript `SourceNode` tree, but it still sends the raw map through
the same WASM-backed `SourceMapConsumer.eachMapping` operation. On the largest
input, that operation throws `RuntimeError: unreachable` before compact leaves
can provide their savings.

The branch therefore fixes a demonstrated intermediate-scale failure mode, not
the complete issue at its largest reported scale.

```text
Current large-input result

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

Even after the decode boundary is removed, at least two cache writers and the
final map writer still construct very large monolithic JSON strings. Those are
independent failure boundaries.

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

## Why the largest reproduction still fails

The local helper copies the segmentation algorithm from `source-map@0.7.4`,
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

The reporter's real `3200 x 400` run fails at step 3. The branch optimizes step
6. Reducing the size of an object that has not yet been allocated cannot help
the earlier decoder complete.

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

## Current evidence and limitations

- The branch contains seven focused procedural and contract tests; all seven
  passed on 2026-09-09.
- The tests establish compact-leaf output parity and reuse for their generated
  inputs.
- Historical branch experiments establish a substantial reduction in retained
  expanded-tree heap and successful `400 x 400` builds.
- The reporter supplied direct evidence that the real `3200 x 400` map still
  fails during `eachMapping`.
- The reporter's large artifacts and harness are not present in this checkout,
  so that result was analyzed but not rerun here.
- No cache format, dependency, or public API has been changed by the current
  branch.

## Review order

1. Confirm the failure-boundary distinction in this document.
2. Review `tools/isobuild/compact-source-node.ts` and its parity tests.
3. Review the linker call and consumer lifetime in `tools/isobuild/linker.js`.
4. Inspect the linker, SWC, and final-output serialization boundaries.
5. Select and specify the decoder/composition design before implementation.
6. Run the small semantic suite, then the captured large-stage harness, then
   full multi-architecture builds.
