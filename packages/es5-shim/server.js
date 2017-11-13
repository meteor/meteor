const { onPageLoad } = require("meteor/server-render");

const hasOwn = Object.prototype.hasOwnProperty;
const minimumMajorVersions = {
  chrome: 23,
  firefox: 21,
  ie: 10,
  safari: 6,
  phantomjs: 2,
};

onPageLoad(sink => {
  if (doNotNeedShim(sink.request)) {
    return;
  }

  sink.appendToHead(makeScript("shim"));
  sink.appendToHead(makeScript("sham"));
});

function doNotNeedShim(request) {
  const { browser, url } = request;
  const query = url && url.query;
  const forceEs5Shim = query && query.force_es5_shim;
  if (! forceEs5Shim &&
      browser &&
      hasOwn.call(minimumMajorVersions, browser.name) &&
      browser.major >= minimumMajorVersions[browser.name]) {
    return true;
  }
  return false;
}

function makeScript(kind) {
  return '\n<script src="/packages/es5-shim/es5-' +
    kind + (
      Meteor.isProduction ? ".min.js" : ".js"
    ) + '"></script>';
}
