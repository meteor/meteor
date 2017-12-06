exports.getPreset = function (api, options) {
  return {
    plugins: [
      require("@babel/plugin-syntax-flow"),
      require("@babel/plugin-syntax-async-generators"),
      require("@babel/plugin-syntax-object-rest-spread"),
      require("@babel/plugin-check-constants"),
      [require("@babel/plugin-transform-for-of"), {
        loose: true
      }],
      require("@babel/plugin-transform-literals"),
      require("@babel/plugin-transform-parameters"),
      require("@babel/plugin-transform-unicode-regex"),
      require("@babel/plugin-proposal-object-rest-spread"),
      require("@babel/plugin-transform-flow-strip-types"),
      require("@babel/plugin-transform-exponentiation-operator"),
      require("@babel/plugin-proposal-async-generator-functions"),
      require("@babel/plugin-transform-async-to-generator"),
    ]
  };
}

exports.versions = {
  chrome: 49,
  edge: 13,
  firefox: 46,
  mobile_safari: 10,
  opera: 38,
  safari: 10
};
