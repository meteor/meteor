var CleanCss = Npm.require('clean-css');

CleanCSSProcess = function (source, options) {
  options = _.extend({ processImport: false }, options);
  var instance = new CleanCss(options);
  // after concatenation some @import's might be left in the middle of CSS file
  // but they required to be in the beginning.
  source = CSSPullImports(source);
  return instance.minify(source);
};

UglifyJSMinify = Npm.require('uglify-js').minify;

var CSSPullImports = function (source) {
  var importRegExp = /^\s*@import\s*[^;]*;\s*/gm;
  var imports = source.match(importRegExp) || [];
  var newSource = source.replace(importRegExp, '');

  newSource = imports.join('') + newSource;

  return newSource;
}

