Plugin.registerMinifier({
  extensions: ["js"],
}, function () {
  var minifier = new Minifier();
  return minifier;
});

function Minifier () {};

Minifier.prototype.processFilesForBundle = function (files) { };

