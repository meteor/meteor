var path = require("path");
var meteorBabelTestPath = __dirname;
var meteorBabelPath = path.dirname(meteorBabelTestPath);
var features = {
  react: true,
  typescript: true,
  jscript: true
};

if (! process.env.IGNORE_NODE_MAJOR_VERSION) {
  features.nodeMajorVersion = parseInt(process.versions.node);
}

if (process.env.COMPILE_FOR_MODERN_BROWSERS) {
  features.modernBrowsers = true;
}

var babelOptions = require("../options").getDefaults(features);

require("../register")
  .setCacheDirectory(process.env.BABEL_CACHE_DIR)
  .setSourceMapRootPath(meteorBabelPath)
  .allowDirectory(meteorBabelTestPath)
  // Needed by the d3 test in ../test/tests.js:
  .allowDirectory(path.join(meteorBabelPath, "node_modules", "d3"))
  .excludeFile(path.join(meteorBabelTestPath, "./not-transformed.js"))
  .setBabelOptions(babelOptions);
