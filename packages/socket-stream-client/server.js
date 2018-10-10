import {
  setMinimumBrowserVersions,
} from "meteor/modern-browsers";

setMinimumBrowserVersions({
  chrome: 16,
  edge: 12,
  firefox: 11,
  ie: 10,
  mobile_safari: [6, 1],
  phantomjs: 2,
  safari: 7,
}, module.id);
