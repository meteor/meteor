# Source map regression fixture

`source-maps.test.js` uses this small TypeScript app to check the debugging acceptance criteria in [#14655](https://github.com/meteor/meteor/issues/14655#issuecomment-5717955850). It runs against the checkout under test, so the same assertions can be used before and after a source-map optimization.

The tests compare source paths and embedded source contents with these files, set breakpoints using original line and column positions, step to the next statement, and map browser exception frames back to the exact `new Error` token. They also load a separate lazy chunk and repeat the browser checks after a rebuild that shifts the original line numbers. A separate source-map consumer (`@jridgewell/trace-mapping`) checks the generated mappings independently of Meteor's consumer. Build checks locate a known error-message literal in the emitted JavaScript and verify its original line and column.

Legacy debug builds exercise both Babel and SWC. The fixture installs `@swc/helpers` and executes the built legacy program to verify that the final transform keeps its helpers available at runtime. A second build inserts blank lines into the original TypeScript while leaving the generated Rspack JavaScript byte-identical; the final maps must contain the updated source text and positions. This keeps Meteor's compiler and linker caches warm, clearing only Rspack's persistent cache to isolate the handoff between the bundlers.

One additional regression is explicitly skipped: `updates source locations with a warm Rspack persistent cache`. With Rspack 2.2.0, the same edit leaves the original `client-rspack.js.map` stale before Meteor reads it. Clearing only `node_modules/.cache/rspack` produces the updated map. Enable that test when evaluating a candidate for this remaining gap; it uses the same assertions without clearing Rspack's cache. The passing suite does not establish correctness for that case.

Both modern and legacy browser programs run in Chromium; a legacy user agent selects the legacy program and the test verifies that selection. This validates the legacy build pipeline, not compatibility with an actual old browser. Debug and production builds also emit the Cordova web program with `--server-only`, without installing a native SDK. The standard production minifier currently discards final browser maps, so production checks cover application startup and the Rspack maps that are emitted on disk rather than requiring missing maps.

The fixture uses a path containing spaces and Unicode characters. Map loading accepts inline, HTTP and file URLs, so tests do not prescribe whether server maps must be embedded or external. Browser maps are loaded when scripts are reported, as a debugger frontend would do, including the maps for HMR updates. Server coverage includes both Meteor and Rspack, and the existing `meteor self-test "source maps"` additionally checks tool and build-plugin stack traces.

Run from the repository root:

```sh
npm run test:e2e -- --runInBand --runTestsByPath source-maps.test.js
./meteor self-test "source maps" --retries 0
npm run test:e2e:groups:audit
```

The suite is included in the `regressions` E2E group. Chromium's debugger protocol supplies the generated locations; these tests do not automate the DevTools Sources UI. Windows and macOS runs, remote/container map retrieval, native Cordova debugging, and manual DevTools source selection remain platform acceptance checks. The 400 × 400 baseline/candidate output comparison, larger stress workloads, peak process-tree RSS, and build-time measurements remain separate from this deterministic correctness suite.
