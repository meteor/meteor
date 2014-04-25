Package.describe({
  name: "handlebars",
  test: "handlebars-test",
  summary: "Deprecated",
  version: '1.0.0',
  internal: true
});

Package.on_use(function (api) {
// XXX we unfortunately we can't do this since `meteor test-packages`
// tries to load all packages.
//
//  throw new Error(
//    "The 'handlebars' package is deprecated. "
//      + "`Handlebars.registerHelper` is now `UI.registerHelper` in the 'ui' package.");
});

