const terser = Npm.require("terser");

meteorJsMinify = function (source) {
  const NODE_ENV = process.env.NODE_ENV || "development";

  const terserOptions = {
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

  const terserResult = terser.minify(source, terserOptions);
  
  console.log(terserResult.error.message);
  console.log(terserResult.error.line);
  console.log(terserResult.error.col);
  
  // the terser api doesnt throw exceptions, so we throw one ourselves
  if (terserResult.error) throw terserResult.error;
  
  return terserResult.code;
};
