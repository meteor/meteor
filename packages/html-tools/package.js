Package.describe({
  summary: "Standards-compliant HTML tools"
});

Package.on_use(function (api) {
  api.use('htmljs');
  api.imply('htmljs');

//  api.add_files(['scanner.js']);
});
