import { onPageLoad } from "meteor/server-render";

const sockjsVersion = "0.3.4";
const hasOwn = Object.prototype.hasOwnProperty;
const minimumMajorVersions = {
  chrome: 16,
  firefox: 11,
  ie: 10,
  safari: 7,
  phantomjs: 2,
};

onPageLoad(sink => {
  if (doNotNeedShim(sink.request)) {
    return;
  }

  sink.appendToHead(makeScript(sockjsVersion));
});

function doNotNeedShim(request) {
  const { browser, url } = request;
  const query = url && url.query;
  const forceSockJs = query && query.force_sockjs;
  if (! forceSockJs &&
      browser &&
      hasOwn.call(minimumMajorVersions, browser.name) &&
      browser.major >= minimumMajorVersions[browser.name]) {
    return true;
  }
  return false;
}

function makeScript(version) {
  return '\n<script src="/packages/sockjs-shim/sockjs-' +
    version + (
      Meteor.isProduction ? ".min.js" : ".js"
    ) + '"></script>';
}
