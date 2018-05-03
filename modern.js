exports.getPreset = function (api, options) {
  return {
    plugins: [
      require("@babel/plugin-syntax-flow"),
      require("@babel/plugin-syntax-async-generators"),
      require("@babel/plugin-syntax-object-rest-spread"),
      [require("@babel/plugin-transform-for-of"), {
        loose: true
      }],
      require("@babel/plugin-transform-literals"),
      require("@babel/plugin-transform-template-literals"),
      // [require("@babel/plugin-transform-classes"), {
      //   loose: true
      // }],
      require("@babel/plugin-transform-parameters"),
      // require("@babel/plugin-transform-unicode-regex"),
      require("@babel/plugin-proposal-object-rest-spread"),
      require("@babel/plugin-transform-flow-strip-types"),
      require("@babel/plugin-transform-exponentiation-operator"),
      require("@babel/plugin-proposal-async-generator-functions"),
      // require("@babel/plugin-transform-async-to-generator"),
    ]
  };
};

// Minimum versions if we assume native support for async functions.
// Amazingly, this accounts for 70%+ of internet users!
// https://caniuse.com/#feat=async-functions
exports.minimumVersions = {
  chrome: 55,
  edge: 15,
  firefox: 52,
  mobile_safari: [10, 3],
  node: 8,
  opera: 42,
  safari: [10, 1],
  // Electron 1.6.0 uses Chromium 56.0.2924.87, per
  // https://github.com/Kilian/electron-to-chromium/blob/master/full-versions.js
  electron: [1, 6]
};
