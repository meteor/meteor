Package.describe({
  summary: "Mootools library package 1.4.5"
});

Package.on_use(function (api) {
  api.add_files('mootools.js', 'client');
});
