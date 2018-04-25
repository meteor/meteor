require("./extensions.js");

require("meteor-promise").makeCompatible(
  Promise,
  // Allow every Promise callback to run in a Fiber drawn from a pool of
  // reusable Fibers.
  require("fibers")
);

// Reference: https://caniuse.com/#feat=promises
require("meteor/modern-browsers").setMinimumBrowserVersions({
  chrome: 32,
  edge: 12,
  // Since there is no IE11, this effectively excludes Internet Explorer
  // (pre-Edge) from the modern classification. #9818 #9839
  ie: 12,
  firefox: 29,
  mobile_safari: 8,
  opera: 20,
  safari: [7, 1],
}, module.id);
