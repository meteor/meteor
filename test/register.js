var path = require("path");
var meteorBabelTestPath = __dirname;
var meteorBabelPath = path.dirname(meteorBabelTestPath);
var babelOptions = require("../options").getDefaults({
  react: true,
  jscript: true
});

require("../register")
  .setSourceMapRootPath(meteorBabelPath)
  .allowDirectory(meteorBabelTestPath)
  .setBabelOptions(babelOptions);
