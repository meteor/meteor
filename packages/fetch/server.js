// import fetch from 'node-fetch' would not work due to issues with isopacket combined
import('node-fetch').then(function (result) {
  exports.fetch = result.fetch;
  exports.Headers = result.Headers;
  exports.Request = result.Request;
  exports.Response = result.Response;
});

const { setMinimumBrowserVersions } = require("meteor/modern-browsers");

// https://caniuse.com/#feat=fetch
setMinimumBrowserVersions({
  chrome: 42,
  edge: 14,
  firefox: 39,
  mobile_safari: [10, 3],
  opera: 29,
  safari: [10, 1],
  phantomjs: Infinity,
  // https://github.com/Kilian/electron-to-chromium/blob/master/full-versions.js
  electron: [0, 25],
}, module.id);
