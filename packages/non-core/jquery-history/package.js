Package.describe({
  summary: "pushState module from the jQuery project",
  version: "1.0.1"
});

Package.on_use(function (api) {
  api.use('json', 'client');
  api.use('jquery', 'client');
  api.add_files(['history.adapter.jquery.js',
                 'history.html4.js',
                 'history.js'],
                'client');
});
