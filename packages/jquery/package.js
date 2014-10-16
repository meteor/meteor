Package.describe({
  summary: "Manipulate the DOM using CSS selectors",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.add_files(['jquery.js', 'post.js'], 'client');

  api.export('$', 'client');
  api.export('jQuery', 'client');
});
