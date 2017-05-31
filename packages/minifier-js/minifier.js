var uglify;

meteorJsMinify = function (source) {
  var result = {};
  uglify = uglify || Npm.require("uglify-js");

  try {
    var uglifyResult = uglify.minify(source, {
      compress: {
        drop_debugger: false,
        unused: false,
        dead_code: false
      }
    });

    if (typeof uglifyResult.code === "string") {
      result.code = uglifyResult.code;
    } else {
      throw uglifyResult.error ||
        new Error("unknown uglify.minify failure");
    }

  } catch (e) {
    // Although Babel.minify can handle a wider variety of ECMAScript
    // 2015+ syntax, it is substantially slower than UglifyJS, so we use
    // it only as a fallback.
    result.code = Babel.minify(source).code;
  }

  return result;
};
