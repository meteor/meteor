var path = require("path");
var meteorBabelTestPath = __dirname;
var meteorBabelPath = path.dirname(meteorBabelTestPath);
var features = {
  react: true,
  jscript: true
};

if (! process.env.IGNORE_NODE_MAJOR_VERSION) {
  features.nodeMajorVersion = parseInt(process.versions.node);

  if (process.env.COMPILE_FOR_MODERN_BROWSERS) {
    features.modernBrowsers = true;
  }
}

var babelOptions = require("../options").getDefaults(features);

require("../register")
  .setSourceMapRootPath(meteorBabelPath)
  .allowDirectory(meteorBabelTestPath)
  .setBabelOptions(babelOptions);
