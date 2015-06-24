var getDefaultOptions = require("./options").getDefaults;

// Options passed to compile will completely replace the default options,
// so if you only want to modify the default options, call this function
// first, modify the result, and then pass those options to compile.
exports.getDefaultOptions = getDefaultOptions;

exports.parse = function parse(source, options) {
  return require("babel-core").parse(source, options);
};

exports.compile = function compile(source, options) {
  options = options || getDefaultOptions();
  return require("babel-core").transform(source, options);
};

exports.runtime = function runtime() {
  require("babel-core/external-helpers");
  return global.babelHelpers;
};
