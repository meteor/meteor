### Basic implementation:

- [x] Future-proof `findImportedModuleIdentifiers` for real `import(...)`
- [x] Source maps in development
- [x] Debugger stops at reasonable points in dev tools
- [x] Open another WebSocket? NO
- [x] Make `import(...)` work on the server
- [x] Modules are minified but not merged in production
  - [x] Wrap modules with function to enable better minification
- [x] Babel transform from `import(...)` to `module.importAsync(...)`
- [x] Local module caching.
  - [x] Prototype with `localStorage`.
  - [x] Reimplement using `indexedDB` (much larger size limits).
- [x] Compact `previous` state representation
- [x] Improve dependency resolution in `packages/dynamic-import/server.js`
- [x] Report static import/syntax/etc. errors for async files
- [x] What about old/new versions of code?
- [x] What about package pseudo-globals (imports)?
- [x] What about dynamic stubs?
- [x] Avoid creating dynamic files on the server.
- [ ] ~~`Mp.dynamicImport` could be implemented without the fallback on the server if we were sure the server had no dynamic files.~~
- [x] Make sure client-only reloads work (revisit _read caching).
- [x] Make sure path manipulation is Windows-safe.
- [x] Install dynamic modules with correct `meteorInstall` options.
- [x] Tests!

### Future work:

- [ ] Batch multiple `__dynamicImport` method calls?
- [ ] Detect modules unevaluated during page load and recommend importing them dynamically.
- [ ] Quantify the impact of using `import(...)`.
- [ ] Report initial bundle sizes.
- [ ] Warn about `import(...)` calls before `Meteor.startup`, since they should probably be static.
- [ ] Analyze module graph to suggest dynamic cut points (e.g. in router callbacks).
- [ ] Warn if dynamically imported modules are imported statically elsewhere (killing the benefit of the dynamic import).
- [ ] Use `Cache-Control: immutable` for the initial bundle.
- [ ] Upgrade caching to `ServiceWorker` and `Cache` in supporting browsers (if actually faster!).
- [ ] Preload modules that are often dynamically imported, when page becomes idle.
- [ ] Allow the client to overfetch soon-to-be-needed modules to avoid waterfalls.
- [ ] Write [Meteor Guide](https://guide.meteor.com/) article about techniques for optimizing page load times.
  - [ ] Inlining imports.
  - [ ] Making eager modules in apps and packages lazy.
  - [ ] Using dynamic `import(...)` in the right places.
