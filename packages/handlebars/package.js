Package.describe({
  summary: "Deprecated",
  internal: true
});

Package.on_use(function (api) {
  throw new Error(
    "The 'handlebars' package is deprecated. "
      + "`Handlebars.registerHelper` is now defined in the 'ui' package.");
});
