Package.describe({
  name: "jquery-history",
  summary: "Deprecated package for HTML5 pushState",
  version: "1.0.2"
});

Package.on_use(function (api) {
  api.versionsFrom('1.0');
  api.use('json', 'client');
  api.use('jquery', 'client');
  api.add_files(['history.adapter.jquery.js',
                 'history.html4.js',
                 'history.js'],
                'client');
});
