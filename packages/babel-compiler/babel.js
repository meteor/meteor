var meteorBabel = Npm.require('meteor-babel');

// Read in user config from optional .babelrc file, which must be located 
// in the project root directory. .babelrc must be formatted as in the 
// example below.
//{
//    "whitelist": [
//        "es7.decorators",
//        "es7.classProperties",
//        "es7.exportExtensions",
//        "es7.comprehensions",
//        "es6.modules"
//    ],
//    "stage": 0
//}
var babelUserConfig = function () {
  var fs = Npm.require('fs');
  var path = Npm.require('path');

  var appdir = process.env.PWD || process.cwd();
  var babelOptionsFilePath = path.join(appdir, '.babelrc');

  if (fs.existsSync(babelOptionsFilePath)) {
    return JSON.parse(fs.readFileSync(babelOptionsFilePath, {encoding: 'utf8'}));
  }
}();

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

  // Bring in user Babel config options from .babelrc
  for (propName in babelUserConfig) {
    if (babelUserConfig.hasOwnProperty(propName)) {
      var prop = babelUserConfig[propName];
      if (prop instanceof Array) {
        prop.forEach(function (opt) {
          if (options[propName].indexOf(opt) === -1)
            options[propName].push(opt);
        })
      } else {
        options[propName] = prop;
      }
    }
  }

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
