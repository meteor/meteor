require("@meteorjs/reify/lib/runtime").enable(
  module.constructor.prototype
);

// XXX: hack so core-runtime can import entry.js
require("@meteorjs/reify/lib/runtime/entry");
