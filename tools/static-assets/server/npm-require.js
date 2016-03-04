var assert = require("assert");

function getRelID(id) {
  assert.strictEqual(id.charAt(0), "/");
  return "./npm" + id.replace(/:/g, "_");
}

function npmRequire(id) {
  return require(getRelID(id));
}

function resolve(id) {
  return require.resolve(getRelID(id));
}

exports.require = npmRequire;
exports.resolve = npmRequire.resolve = resolve;
