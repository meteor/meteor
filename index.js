exports.compile = function compile(source) {
  return require("babel-core").transform(
    source,
    require("./options")
  );
};
