Package.describe({
  summary: "Deprecated",
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

