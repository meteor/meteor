Plugin.registerMinifier({
  extensions: ["js"]
}, function () {
  var minifier = new UglifyJSMinifier();
  return minifier;
});

function UglifyJSMinifier () {};

UglifyJSMinifier.prototype.processFilesForBundle = function (files, options) {
  var mode = options.minifyMode;

  // don't minify anything for development
  if (mode === 'development') {
    files.forEach(function (file) {
      file.addJavaScript({
        data: file.getContentsAsBuffer(),
        sourceMap: file.getSourceMap(),
        path: file.getPathInBundle()
      });
    });
    return;
  }

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


