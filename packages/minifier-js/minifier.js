let esbuild;

const terserMinify = async (source, options, callback) => {
  esbuild = esbuild || Npm.require("esbuild");
  try {
    const result = await esbuild.transform(source, options);
    callback(null, result);
    return result;
  } catch (e) {
    callback(e);
    return e;
  }
};

export const meteorJsMinify = function (source) {
  const result = {};

  const options = {
    minify: true,
  };

  const terserJsMinify = Meteor.wrapAsync(terserMinify);
  let esbuildResult;
  try {
    esbuildResult = terserJsMinify(source, options);
  } catch (e) {
    throw e;
  }

  // this is kept to maintain backwards compatability
  result.code = esbuildResult.code;
  result.minifier = 'esbuild';

  return result;
};
