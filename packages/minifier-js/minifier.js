let swc;

const swcMinify = async (source, options, callback) => {
  swc = swc || Npm.require('@swc/core');
  try {
    const result = await swc.minify(source, options);
    callback(null, result);
    return result;
  } catch (e) {
    // the older minifier (esbuild) returned those fields, swc does not.
    // injecting those fields so tests expecting them don't break
    const error = Object.assign(e, {
      name: 'minification error',
      filename: '',
      line: '',
      col: '',
    });
    callback(error);
    return error;
  }
};

export const meteorJsMinify = function(source) {
  const result = {};

  const options = {
    mangle: true,
    compress: {
      drop_debugger: false, // remove debugger; statements
      unused: false, // drop unreferenced functions and variables
      dead_code: true, // remove unreachable code
      typeofs: false, // set to false due to known issues in IE10
    },
  };

  const terserJsMinify = Meteor.wrapAsync(swcMinify);
  let esbuildResult;
  try {
    esbuildResult = terserJsMinify(source, options);
  } catch (e) {
    throw e;
  }

  // this is kept to maintain backwards compatability
  result.code = esbuildResult.code;
  result.minifier = 'swc';

  return result;
};
