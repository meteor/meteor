var strictModulesPlugin =
  require("babel-plugin-transform-es2015-modules-commonjs");

module.exports = [function sloppy() {
  var visitor = strictModulesPlugin.apply(this, arguments);
  delete visitor.inherits;
  return visitor;
}, {
  allowTopLevelThis: true,
  strict: false,
  loose: true
}];
