var assert = require("assert");
var topLevelIdPattern = /^[^./]/;

function getRelID(id) {
  assert.strictEqual(id.charAt(0), "/");
  return "./npm" + id.replace(/:/g, "_");
}

function npmRequire(id) {
  try {
    var absId = resolve(id);
  } finally {
    if (absId) return require(absId);
    if (topLevelIdPattern.test(id)) {
      // Fall back to dev_bundle/lib/node_modules and built-in modules.
      return require(id);
    }
  }
}

function resolve(id) {
  return require.resolve(getRelID(id));
}

exports.require = npmRequire;
exports.resolve = npmRequire.resolve = resolve;
