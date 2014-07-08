Package.describe({
  summary: "Common code for spacebars and spacebars-compiler",
  version: "1.0.0"
});

Package.on_use(function (api) {
  api.export('Spacebars');
  api.add_files('spacebars.js');
});
