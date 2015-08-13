var babelOptions = require("../options").getDefaults({
  modules: true,
  meteorAsyncAwait: true,
  react: true,
  jscript: true
});

require("../register")({
  sourceMapRootPath: require("path").dirname(__dirname),
  babelOptions: babelOptions
});
