Package.describe({
  summary: "Deprecated",
  version: '1.0.3'
});

Package.onUse(function (api) {
// XXX we unfortunately we can't do this since `meteor test-packages`
// tries to load all packages.
//
//  throw new Error(
//    "The 'handlebars' package is deprecated. "
//      + "`Handlebars.registerHelper` is now `Template.registerHelper`.");
});
