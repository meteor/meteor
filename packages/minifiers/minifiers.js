var CleanCss = Npm.require('clean-css');

CleanCSSProcess = function (source, options) {
  var instance = new CleanCss(options);
  return instance.minify(source);
};

CssParse = Npm.require('css-parse');
CssStringify = Npm.require('css-stringify');

UglifyJSMinify = Npm.require('uglify-js').minify;

