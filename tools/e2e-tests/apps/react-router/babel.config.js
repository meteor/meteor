const ReactCompilerConfig = {
  target: '18',
};

module.exports = function (api) {
  // required when exporting a function
  api.cache(true); // cache forever; or api.cache.using(() => process.env.NODE_ENV)

  console.log('babel.config.js: babel-plugin-react-compiler');

  return {
    plugins: [
      ['babel-plugin-react-compiler', ReactCompilerConfig], // must run first!
      '@babel/plugin-syntax-jsx',
    ],
  };
};
