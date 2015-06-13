exports.compile = function compile(source) {
  return require("babel-core").transform(
    source,
    require("./options")
  );
};

exports.runtime = function runtime() {
  require("babel-core/external-helpers");
  return global.babelHelpers;
};
