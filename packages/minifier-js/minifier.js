var terser;

const getGlobalDefsOptions = ({ arch }) => ({
  "Meteor.isServer": false,
  "Meteor.isTest": false,
  "Meteor.isDevelopment": false,
  "Meteor.isClient": true,
  "Meteor.isProduction": true,
  "Meteor.isCordova": arch === 'web.cordova',
});

meteorJsMinify = function (source, options) {
  var result = {};
  var NODE_ENV = process.env.NODE_ENV || "development";
  terser = terser || Npm.require("terser");
  const globalDefs = getGlobalDefsOptions(options);

  const globalDefsMapping = Object.entries(globalDefs).reduce((acc, [from, to]) => {
    const parts = from.split('.');
    if (parts.length < 2) {
      return acc;
    }
    const startValue = parts[0];
    const endValue = parts[1];
    return ({
      ...acc,
      [startValue]: {
        ...acc[startValue], [endValue]: to
      }
    });
  }, {});
  try {
    var optimizedCode = Babel.replaceMeteorInternalState(source, globalDefsMapping)
    var terserResult = terser.minify(optimizedCode, {
      compress: {
        drop_debugger: false,
        unused: false,
        dead_code: true,
        global_defs: {
          "process.env.NODE_ENV": NODE_ENV,
          "process.env.NODE_DEBUG": false,
        },
        // passes: 2
      },
      // mangle: {toplevel: true},
      // Fix issue #9866, as explained in this comment:
      // https://github.com/mishoo/UglifyJS2/issues/1753#issuecomment-324814782
      // And fix terser issue #117: https://github.com/terser-js/terser/issues/117
      safari10: true,
    });
    if (typeof terserResult.code === "string") {
      result.code = terserResult.code;
      result.minifier = 'terser';
    } else {
      throw terserResult.error ||
      new Error("unknown terser.minify failure");
    }
  } catch (e) {
    // Although Babel.minify can handle a wider variety of ECMAScript
    // 2015+ syntax, it is substantially slower than UglifyJS/terser, so
    // we use it only as a fallback.
    var options = Babel.getMinifierOptions({
      inlineNodeEnv: NODE_ENV
    });
    result.code = Babel.minify(source, options).code;
    result.minifier = 'babel-minify';
  }
  return result;
};
