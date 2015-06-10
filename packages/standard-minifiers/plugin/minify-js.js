Plugin.registerMinifier({
  extensions: ["js"],
}, function () {
  var minifier = new UglifyJSMinifier();
  return minifier;
});

function UglifyJSMinifier () {};

UglifyJSMinifier.prototype.processFilesForTarget = function (files) {
  var minifyOptions = {
    fromString: true,
    compress: {
      drop_debugger: false,
      unused: false,
      dead_code: false
    }
  };

  files.forEach(function (file) {
    file.addJavaScript({
      data: UglifyJSMinify(
        file.getContentsAsString(), minifyOptions).code
      });
  });
};


