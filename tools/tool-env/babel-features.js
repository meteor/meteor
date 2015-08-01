// Feature flags passed to require("meteor-babel").getDefaultOptions in
// tools/main-transpile-wrapper.js and tools/isopack.js.

// ES6 module syntax is enabled by default for Meteor tool code,
// implemented via CommonJS require/exports.
exports.modules = true;

// ES7 async functions and await expressions are transpiled to
// Promise.asyncApply and Promise.await, implemented via Fibers.
exports.meteorAsyncAwait = true;
