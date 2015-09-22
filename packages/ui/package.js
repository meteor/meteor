Package.describe({
  summary: "Deprecated: Use the 'blaze' package",
  version: '1.0.8'
});

Package.onUse(function (api) {
  api.use('blaze');
  api.imply('blaze');

  // XXX COMPAT WITH PACKAGES BUILT FOR 0.9.0.
  //
  // (in particular, packages that have a weak dependency on this
  // package, since then exported symbols live on the
  // `Package.ui` object)
  api.export(['Blaze', 'UI', 'Handlebars']);
});
