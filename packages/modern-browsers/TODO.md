## Remaining work

- [x] Come up with a system for constraining minimum browser versions.

- [x] Research minimum versions for key ECMAScript features.

- [ ] Use the minimum versions in `webapp` to determine JS bundle.

- [ ] Import different `core-js` polyfills in `ecmascript-runtime-client`
      depending on modern/legacy classification.

- [ ] Really vet the set of imported `core-js` polyfills based on known
      minimum versions imposed by `setMinimumBrowserVersions`.

- [ ] Create an `isobuild:web-browser-legacy` pseudopackage.

- [ ] Add tests to the `modules` test app.

- [ ] Expose `Meteor.isModern` on both client and server.

- [ ] Make sure in-browser tests run with both `web.browser` and
      `web.browser.legacy`.

- [ ] Use `web.browser.legacy` to handle `es5-shim` instead.

- [ ] Use `web.browser.legacy` to handle SockJS instead?

- [ ] Load `SockJS` using dynamic `import()` if necessary in modern
      `web.browser` clients.

- [ ] Use different plugins in babel-compiler for `web.browser.legacy`.

- [ ] Fix dynamic module source map URLs (prepend `/__arch`).

- [ ] Fix tests failing because of changes to static resource URLs.

- [ ] In development, save time by only rebuilding `web.browser` (modern)?

- [ ] Try adding a `web.worker` platform and see if it works as expected.

- [ ] Update `History.md` to reflect all these changes.

- [ ] Write a blog post about the new modern/legacy system.

- [ ] Update `compiler.BUILT_BY` and `LINKER_CACHE_SALT` to force
      recompilation and relinking.
