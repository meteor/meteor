var meteorBabel = null;
function getMeteorBabel() {
  return meteorBabel || (meteorBabel = Npm.require("meteor-babel"));
}

/**
 * Returns a new object containing default options appropriate for
 */
function getDefaultOptions(extraFeatures) {
  // See https://github.com/meteor/babel/blob/master/options.js for more
  // information about what the default options are.
  var options = getMeteorBabel().getDefaultOptions(extraFeatures);

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
    return getMeteorBabel().parse(source);
  },

  compile: function (source, options) {
    options = options || getDefaultOptions();
    return getMeteorBabel().compile(source, options);
  },

  setCacheDir: function (cacheDir) {
    getMeteorBabel().setCacheDir(cacheDir);
  },

  minify: function (source, options) {
    var options = options || getMeteorBabel().getMinifierOptions();
    return getMeteorBabel().minify(source, options);
  },

  getMinifierOptions: function (extraFeatures) {
    return getMeteorBabel().getMinifierOptions(extraFeatures);
  }
};
