const { onPageLoad } = require("meteor/server-render");
const {
  doNotNeedShim,
  makeScript,
} = require("meteor/shim-common");

const minimumMajorVersions = {
  chrome: 23,
  firefox: 21,
  ie: 10,
  safari: 6,
  phantomjs: 2,
};

onPageLoad(sink => {
  if (doNotNeedShim(sink.request,
                    minimumMajorVersions,
                    "force_es5_shim")) {
    return;
  }
  sink.appendToHead(
    makeScript("es5-shim/es5-shim-sham")
  );
});
