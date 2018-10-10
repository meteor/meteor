const {
  setMinimumBrowserVersions,
} = require("meteor/modern-browsers");

setMinimumBrowserVersions({
  chrome: 49,
  edge: 12,
  // Since there is no IE11, this effectively excludes Internet Explorer
  // (pre-Edge) from the modern classification. #9818 #9839
  ie: 12,
  firefox: 45,
  mobileSafari: 10,
  opera: 38,
  safari: 10,
  // Electron 1.6.0+ matches Chromium 55, per
  // https://github.com/Kilian/electron-to-chromium/blob/master/full-versions.js
  electron: [1, 6],
}, module.id);
