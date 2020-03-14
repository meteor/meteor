const terser = Npm.require("terser");

meteorJsMinify = function (source) {
  const result = {};
  const NODE_ENV = process.env.NODE_ENV || "development";

  try {
    const options = {
      compress: {
        passes: 1,             // default is 1 (2 or more passes could lead to better compression)
        inline: true,          // default is true which will aggresively inline functions
        drop_debugger: false,  // remove debugger; statements
        unused: false,         // drop unreferenced functions and variables
        dead_code: true,       // remove unreachable code
        global_defs: {
          "process.env.NODE_ENV": NODE_ENV
        }
      },
      // Fix issue #9866, as explained in this comment:
      // https://github.com/mishoo/UglifyJS2/issues/1753#issuecomment-324814782
      // And fix terser issue #117: https://github.com/terser-js/terser/issues/117
      safari10: true,          // set this option to true to work around the Safari 10/11 await bug
    };

    const terserResult = terser.minify(source, options);

    if (typeof terserResult.code === "string") {
      result.code = terserResult.code;
      result.minifier = 'terser';
    } else {
      throw terserResult.error || new Error("unknown terser.minify failure");
    }

  } catch (err) {
    // Although Babel.minify can handle a wider variety of ECMAScript
    // 2015+ syntax, it is substantially slower than terser, so
    // we use it only as a fallback.
    const options = Babel.getMinifierOptions({
      inlineNodeEnv: NODE_ENV
    });

    result.code = Babel.minify(source, options).code;
    result.minifier = 'babel-minify';
  }

  return result;
};
