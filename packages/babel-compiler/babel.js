var meteorBabel = Npm.require('meteor-babel');

function validateExtraFeatures(extraFeatures) {
  if (extraFeatures) {
    check(extraFeatures, {
      // Modify options to enable React/JSX syntax.
      react: Match.Optional(Boolean),
      // Improve compatibility in older versions of Internet Explorer.
      jscript: Match.Optional(Boolean)
    });
  }
}

/**
 * Returns a new object containing default options appropriate for
 */
function getDefaultOptions(extraFeatures) {
  validateExtraFeatures(extraFeatures);

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

  validateExtraFeatures: validateExtraFeatures,

  compile: function (source, options) {
    options = options || getDefaultOptions();
    return meteorBabel.compile(source, options);
  },

  setCacheDir: function (cacheDir) {
    meteorBabel.setCacheDir(cacheDir);
  }
};
