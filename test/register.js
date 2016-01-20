var babelOptions = require("../options").getDefaults({
  react: true,
  jscript: true
});

require("../register")({
  sourceMapRootPath: require("path").dirname(__dirname),
  babelOptions: babelOptions
});
