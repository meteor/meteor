let terser;

const meteorJsMinify = function (source) {
  const result = {};
  const NODE_ENV = process.env.NODE_ENV || "development";
  terser = terser || Npm.require("terser");

  const options = {
    compress: {
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

  // the terser api doesnt throw exceptions, so we throw one ourselves
  if (terserResult.error) throw terserResult.error;

  // this is kept to maintain backwards compatability
  result.code = terserResult.code;
  result.minifier = 'terser';

  return result;
};

export { meteorJsMinify };
