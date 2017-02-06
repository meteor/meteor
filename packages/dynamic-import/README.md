Remaining work:

- [x] Future-proof `findImportedModuleIdentifiers` for real `import(...)`
- [x] Source maps in development
- [x] Debugger stops at reasonable points in dev tools
- [x] Open another WebSocket? NO
- [x] Make `import(...)` work on the server
- [x] Modules are minified but not merged in production
  - [x] Wrap modules with function to enable better minification
- [x] Babel transform from `import(...)` to `module.importAsync(...)`
- [x] Local module caching.
- [x] Compact `previous` state representation
- [x] Improve dependency resolution in `packages/dynamic-import/server.js`
- [x] Report static import/syntax/etc. errors for async files
- [x] What about old/new versions of code?
- [ ] What about package pseudo-globals (imports)?
- [x] What about dynamic stubs?
- [x] Avoid creating dynamic files on the server.
- [ ] `Mp.dynamicImport` could be implemented without the fallback on the
      server if we were sure the server had no dynamic files.
- [ ] Batch multiple __dynamicImport method calls.
- [x] Make sure client-only reloads work (revisit _read caching).
- [x] Make sure path manipulation is Windows-safe.
- [x] Install dynamic modules with correct `meteorInstall` options.
- [ ] Tests!
