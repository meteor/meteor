exports.getPreset = function (api, options) {
  return {
    plugins: [
      ...require("./proposals.js").plugins,
      require("@babel/plugin-transform-literals"),
      require("@babel/plugin-transform-template-literals"),
      require("@babel/plugin-transform-parameters"),
      // require("@babel/plugin-transform-unicode-regex"),
      require("@babel/plugin-transform-exponentiation-operator"),
    ]
  };
};

// Minimum versions if we assume native support for async functions.
// Amazingly, this accounts for 70%+ of internet users!
// https://caniuse.com/#feat=async-functions
exports.minimumVersions = {
  chrome: 55,
  edge: 15,
  firefox: 53,
  mobile_safari: [10, 3],
  node: 8,
  opera: 42,
  safari: [10, 1],
  // Electron 1.6.0 uses Chromium 56.0.2924.87, per
  // https://github.com/Kilian/electron-to-chromium/blob/master/full-versions.js
  electron: [1, 6],
  // https://github.com/meteor/babel-preset-meteor/issues/13
  samsungInternet: [6, 2],
  facebook: 325
};
