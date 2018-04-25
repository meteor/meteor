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
  mobile_safari: 10,
  opera: 38,
  safari: 10,
}, module.id);
