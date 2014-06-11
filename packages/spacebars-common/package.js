Package.describe({
  name: "spacebars-common",
  test: "spacebars-common-test",
  summary: "Common code for spacebars and spacebars-compiler",
  version: "1.0.0",
  internal: true
});

Package.on_use(function (api) {
  api.export('Spacebars');
  api.add_files('spacebars.js');
});
