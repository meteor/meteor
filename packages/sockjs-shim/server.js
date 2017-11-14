import { onPageLoad } from "meteor/server-render";
import {
  doNotNeedShim,
  makeScript,
} from "meteor/shim-common";

const sockjsVersion = "0.3.4";
const minimumMajorVersions = {
  chrome: 16,
  firefox: 11,
  ie: 10,
  safari: 7,
  phantomjs: 2,
};

onPageLoad(sink => {
  if (doNotNeedShim(sink.request,
                    minimumMajorVersions,
                    "force_sockjs")) {
    return;
  }
  sink.appendToHead(
    makeScript("sockjs-shim/sockjs-" + sockjsVersion)
  );
});
