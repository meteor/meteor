Package.describe({
  name: "jquery-history",
  summary: "Deprecated package for HTML5 pushState",
  version: "1.0.2"
});

Package.onUse(function (api) {
  api.versionsFrom('1.0');
  api.use('json', 'client');
  api.use('jquery', 'client');
  api.addFiles(['history.adapter.jquery.js',
                 'history.html4.js',
                 'history.js'],
                'client');
});
