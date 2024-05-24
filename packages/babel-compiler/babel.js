var meteorBabel = null;
function getMeteorBabel() {
  return meteorBabel || (meteorBabel = Npm.require("@meteorjs/babel"));
}

/**
 * Returns a new object containing default options appropriate for
 */
function getDefaultOptions(extraFeatures) {
  // See https://github.com/meteor/babel/blob/master/options.js for more
  // information about what the default options are.
  return getMeteorBabel().getDefaultOptions(extraFeatures);
}

Babel = {
  getDefaultOptions: getDefaultOptions,

  // Deprecated, now a no-op.
  validateExtraFeatures: Function.prototype,

  parse: function (source) {
    return getMeteorBabel().parse(source);
  },

  compile: function (source, babelOptions, cacheOptions) {
    return getMeteorBabel().compile(
      source,
      babelOptions || getDefaultOptions(),
      cacheOptions
    );
  },

  // This method is deprecated in favor of passing
  // cacheDeps.cacheDirectory to Babel.compile (see above).
  setCacheDir: function (cacheDir) {
    getMeteorBabel().setCacheDir(cacheDir);
  },

  minify: function (source, options) {
    var options = options || getMeteorBabel().getMinifierOptions();
    return getMeteorBabel().minify(source, options);
  },

  getMinifierOptions: function (extraFeatures) {
    return getMeteorBabel().getMinifierOptions(extraFeatures);
  },

  getMinimumModernBrowserVersions: function () {
    return Npm.require("@meteorjs/babel/modern-versions.js").get();
  }
};
