var babelOptions = require("../options").getDefaults({
  modules: true,
  asyncAwait: true,
  react: true,
  jscript: true
});

require("../register")({
  sourceMapRootPath: require("path").dirname(__dirname),
  babelOptions: babelOptions
});
