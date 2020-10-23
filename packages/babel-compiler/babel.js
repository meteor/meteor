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
      cacheOptions,
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
    return Npm.require("meteor-babel/modern-versions.js").get();
  },
  replaceMeteorInternalState: function(source, globalDefsMapping) {
    try {
      const globalDefsKeys = Object.keys(globalDefsMapping);
      return Npm.require("@babel/core").transformSync(source, {
        compact: false,
        plugins: [
          function replaceStateVars({types: t}) {
            return {
              visitor: {
                MemberExpression: {
                  exit(path) {
                    const object = path.node.object.name;
                    const property = path.node.property.name;
                    const globalDefsForStart = object && globalDefsKeys.indexOf(object) > -1 && globalDefsMapping[object];
                    const mappingForEnds = property && globalDefsForStart
                    && Object.keys(globalDefsForStart).indexOf(property) > -1
                        ? globalDefsForStart[property] : null;

                    if (mappingForEnds !== null && path.parentPath.node.type !== "AssignmentExpression") {
                      path.replaceWith(
                          t.booleanLiteral(mappingForEnds === 'true' || mappingForEnds === true)
                      );
                      path.skip();
                    }
                  },
                }
              },
            };
          },
        ],
      }).code;
    } catch(e){
      return source;
    }
  }
};
