var terser;

meteorJsMinify = function (source) {
  var result = {};
  var NODE_ENV = process.env.NODE_ENV || "development";

  terser = terser || Npm.require("terser");

  try {
    var terserResult = terser.minify(source, {
      compress: {
        drop_debugger: false,
        unused: false,
        dead_code: true,
        global_defs: {
          "process.env.NODE_ENV": NODE_ENV
        }
      },
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
