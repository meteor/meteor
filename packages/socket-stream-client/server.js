import {
  setMinimumBrowserVersions,
} from "meteor/modern-browsers";

setMinimumBrowserVersions({
  chrome: 16,
  edge: 12,
  firefox: 11,
  ie: 10,
  mobileSafari: [6, 1],
  phantomjs: 2,
  safari: 7,
  electron: [0, 20],
}, module.id);
