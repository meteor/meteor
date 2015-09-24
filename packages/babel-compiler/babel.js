var meteorBabel = Npm.require('meteor-babel');

function validateExtraFeatures(extraFeatures) {
  if (extraFeatures) {
    check(extraFeatures, {
      // Modify options to enable ES2015 module syntax.
      modules: Match.Optional(Boolean),
      // Modify options to enable async/await syntax powered by Fibers.
      meteorAsyncAwait: Match.Optional(Boolean),
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

  // Provided for backwards compatibility; prefer Babel.compile.
  transformMeteor: function (source, extraOptions) {
    var options = getDefaultOptions();

    if (extraOptions) {
      if (extraOptions.extraWhitelist) {
        options.whitelist.push.apply(
          options.whitelist,
          extraOptions.extraWhitelist
        );
      }

      for (var key in extraOptions) {
        if (key !== "extraWhitelist" &&
            hasOwnProperty.call(extraOptions, key)) {
          options[key] = extraOptions[key];
        }
      }
    }

    return meteorBabel.compile(source, options);
  },

  setCacheDir: function (cacheDir) {
    meteorBabel.setCacheDir(cacheDir);
  }
};
