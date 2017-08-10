This package implements the `Module.prototype.dynamicImport(id)` runtime
API needed for fetching modules dynamically from the server, so that those
modules don't have to be included in the initial JavaScript bundle.

With this package installed, supporting the [dynamic `import(...)`
proposal](https://github.com/tc39/proposal-dynamic-import) is as easy as
compiling `import(...)` to `module.dynamicImport(...)`.

Any version of a module that has been fetched previously will be
permanently cached and should never need to be fetched again by the same
client, even after the window is closed or the browser is restarted.

Meteor 1.5 is necessary for this package to work properly.
