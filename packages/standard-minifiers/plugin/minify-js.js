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

  var allJs = '';
  files.forEach(function (file) {
    allJs += UglifyJSMinify(file.getContentsAsString(), minifyOptions).code;
    allJs += '\n\n';

    Plugin.nudge();
  });

  if (files.length) {
    files[0].addJavaScript({ data: allJs });
  }
};


