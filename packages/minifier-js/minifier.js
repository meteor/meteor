let terser;

const terserMinify = async (source, options) => {
  terser = terser || Npm.require("terser");
  return await terser.minify(source, options);
};

export const meteorJsMinify = async function (source) {
  const result = {};
  const NODE_ENV = process.env.NODE_ENV || "development";


  const options = {
    compress: {
      drop_debugger: false,  // remove debugger; statements
      unused: false,         // drop unreferenced functions and variables
      dead_code: true,       // remove unreachable code
      typeofs: false,        // set to false due to known issues in IE10
      global_defs: {
        "process.env.NODE_ENV": NODE_ENV
      }
    },
    // Fix issue #9866, as explained in this comment:
    // https://github.com/mishoo/UglifyJS2/issues/1753#issuecomment-324814782
    // And fix terser issue #117: https://github.com/terser-js/terser/issues/117
    safari10: true,          // set this option to true to work around the Safari 10/11 await bug
  };

  const terserResult = await terserMinify(source, options);

  // this is kept to maintain backwards compatability
  result.code = terserResult.code;
  result.minifier = 'terser';

  return result;
};
