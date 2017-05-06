/**
 * Returns a new object containing default options appropriate for
 */
function getDefaultOptions(extraFeatures) {
  var meteorBabel = Npm.require('meteor-babel');

  // See https://github.com/meteor/babel/blob/master/options.js for more
  // information about what the default options are.
  var options = meteorBabel.getDefaultOptions(extraFeatures);

  // The sourceMap option should probably be removed from the default
  // options returned by meteorBabel.getDefaultOptions.
  delete options.sourceMap;

  return options;
}

Babel = {
  getDefaultOptions: getDefaultOptions,

  // Deprecated, now a no-op.
  validateExtraFeatures: Function.prototype,

  parse: function (source) {
    return Npm.require('meteor-babel').parse(source);
  },

  compile: function (source, options) {
    var meteorBabel = Npm.require('meteor-babel');
    options = options || getDefaultOptions();
    return meteorBabel.compile(source, options);
  },

  setCacheDir: function (cacheDir) {
    Npm.require('meteor-babel').setCacheDir(cacheDir);
  },

  minify: function(source, options) {
    var meteorBabel = Npm.require('meteor-babel');
    var options = options || meteorBabel.getMinifierOptions();
    return meteorBabel.minify(source, options);
  }
};
