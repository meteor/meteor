require("meteor-babel-helpers");

var Module = module.constructor;

// The Reify runtime now requires a working implementation of
// module.resolve, which should return a canonical absolute module
// identifier string, like require.resolve(id).
Module.prototype.resolve = function (id) {
  return Module._resolveFilename(id, this);
};

require("@meteorjs/reify/lib/runtime").enable(Module.prototype);

