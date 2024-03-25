let terser;

const terserMinify = async (source, options, callback) => {
  terser = terser || Npm.require("terser");
  try {
    // Replace Meteor.isServer, Meteor.isClient, Meteor.isDevelopment, Meteor.isProduction with true or false
    // so that terser can remove the dead code in the appropriate scenario
    const cleanSource = source.replace(/\b(Meteor\.isServer|Meteor\.isDevelopment|process\.env\.NODE_DEBUG)\b/g, 'UGLIFYJS_FALSE')
      .replace(/\b(Meteor\.isClient|Meteor\.isProduction)\b/g, 'UGLIFYJS_TRUE');
    const result = await terser.minify(cleanSource, options);
    callback(null, result);
    return result;
  } catch (e) {
    callback(e);
    return e;
  }
};

export const meteorJsMinify = function (source) {
  const result = {};
  const NODE_ENV = process.env.NODE_ENV || "development";


  const options = {
    compress: {
      drop_debugger: false,  // remove debugger; statements
      unused: false,         // drop unreferenced functions and variables
      dead_code: true,       // remove unreachable code
      typeofs: false,        // set to false due to known issues in IE10
      global_defs: {
        "process.env.NODE_ENV": NODE_ENV,
        UGLIFYJS_FALSE: false,
        UGLIFYJS_TRUE: true
      }
    },
    // Fix issue #9866, as explained in this comment:
    // https://github.com/mishoo/UglifyJS2/issues/1753#issuecomment-324814782
    // And fix terser issue #117: https://github.com/terser-js/terser/issues/117
    safari10: true,          // set this option to true to work around the Safari 10/11 await bug
  };

  const terserJsMinify = Meteor.wrapAsync(terserMinify);
  let terserResult;
  try {
    terserResult = terserJsMinify(source, options);
  } catch (e) {
    throw e;
  }

  // this is kept to maintain backwards compatability
  result.code = terserResult.code;
  result.minifier = 'terser';

  return result;
};
