const nodeFetch = require("node-fetch");
const rawFetch = nodeFetch.default;

// When accounts-express is loaded and provides handleFetch, delegate
// to it so auth/token options work transparently. Otherwise use
// the raw node-fetch implementation directly.
function fetch(url, options) {
  var ae = Package['accounts-express'];
  if (ae && ae.handleFetch) {
    return ae.handleFetch(url, options, rawFetch);
  }
  return rawFetch(url, options);
}

exports.fetch = fetch;
exports.Headers = nodeFetch.Headers;
exports.Request = nodeFetch.Request;
exports.Response = nodeFetch.Response;

const { setMinimumBrowserVersions } = require("meteor/modern-browsers");

// https://caniuse.com/#feat=fetch
setMinimumBrowserVersions({
  chrome: 42,
  edge: 14,
  firefox: 39,
  firefoxIOS: 100,
  mobile_safari: [10, 3],
  opera: 29,
  safari: [10, 1],
  phantomjs: Infinity,
  // https://github.com/Kilian/electron-to-chromium/blob/master/full-versions.js
  electron: [0, 25],
}, module.id);
