Package.describe({
  summary: "Common code for spacebars and spacebars-compiler",
  internal: true
});

Package.on_use(function (api) {
  api.export('Spacebars');
  api.add_files('spacebars.js');
});
