var CleanCss = Npm.require('clean-css');

CleanCSSProcess = function (source, options) {
  var instance = new CleanCss(options);
  return instance.minify(source);
};

UglifyJSMinify = Npm.require('uglify-js').minify;
