Package.describe({
  summary: "Manipulate the DOM using CSS selectors"
});

Package.on_use(function (api, where) {
  api.add_files('jquery.js', 'client');

  api.exportSymbol('$', where);
  api.exportSymbol('jQuery', where);
});
