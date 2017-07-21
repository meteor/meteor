var path = require("path");
var meteorBabelTestPath = __dirname;
var meteorBabelPath = path.dirname(meteorBabelTestPath);
var nodeMajorVersion = parseInt(process.versions.node);
var babelOptions = require("../options").getDefaults({
  nodeMajorVersion,
  react: true,
  jscript: true
});

require("../register")
  .setSourceMapRootPath(meteorBabelPath)
  .allowDirectory(meteorBabelTestPath)
  .setBabelOptions(babelOptions);
