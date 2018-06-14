// Make sure code compiled with features.modernBrowsers is delivered only
// to browsers that satisfy the assumptions of meteor-babel's modern Babel
// configuration.
Package["modern-browsers"].setMinimumBrowserVersions(
  Babel.getMinimumModernBrowserVersions(),
  // Although module.id is the recommended source string to pass as the
  // second argument to setMinimumBrowserVersions, we can't use module.id
  // here because babel-compiler cannot depend on the modules package. We
  // can still make this string look like any other module.id, though.
  "/node_modules/meteor/babel-compiler/versions.js"
);
