// Make sure code compiled with features.modernBrowsers is delivered only
// to browsers that satisfy the assumptions of meteor-babel's modern Babel
// configuration.
Package["modern-browsers"].setMinimumBrowserVersions(
  Babel.getMinimumModernBrowserVersions(),
  "packages/babel-compiler/versions.js"
);
