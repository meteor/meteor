Package.describe({
  summary: "Moved to the 'ddp' package",
  version: '1.0.15'
});

Package.onUse(function (api) {
  api.use("ddp");
  api.imply("ddp");

  // XXX COMPAT WITH PACKAGES BUILT FOR 0.9.0.
  //
  // (in particular, packages that have a weak dependency on this
  // package, since then exported symbols live on the
  // `Package.livedata` object)
  api.export('DDP');
  api.export('DDPServer', 'server');
  api.export('LivedataTest', {testOnly: true});
});
