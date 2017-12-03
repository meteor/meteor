require("./done.js");
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
  firefox: 29,
  mobile_safari: 8,
  opera: 20,
  safari: [7, 1],
});
