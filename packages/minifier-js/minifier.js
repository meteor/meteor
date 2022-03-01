let esbuild;

const terserMinify = async (source, options, callback) => {
  esbuild = esbuild || Npm.require('esbuild');
  try {
    const result = await esbuild.transform(source, options);
    callback(null, result);
    return result;
  } catch (e) {
    const { text, location } = e.errors[0];
    const newError = {
      name: 'Error',
      message: text,
      stack: e.stack,
      filename: location.file,
      line: location.line,
      col: location.column,
    };
    callback(newError);
    return newError;
  }
};

export const meteorJsMinify = function(source) {
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
