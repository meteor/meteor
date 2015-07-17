Plugin.registerMinifier({
  extensions: ["foo"]
}, function () {
  var minifier = new Minifier();
  return minifier;
});

function Minifier () {};

Minifier.prototype.processFilesForBundle = function (files) { };

