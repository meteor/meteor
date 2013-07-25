Package.describe({
  summary: "Manipulate the DOM using CSS selectors"
});

Package.on_use(function (api) {
  api.add_files(['jquery.js', 'post.js'], 'client');

  api.exportSymbol('$', 'client');
  api.exportSymbol('jQuery', 'client');
});
