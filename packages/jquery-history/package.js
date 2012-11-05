Package.describe({
  summary: "pushState module from the jQuery project"
});

Package.on_use(function (api) {
  api.use('jquery');
  api.add_files(['json2.js',
                 'history.adapter.jquery.js',
                 'history.html4.js',
                 'history.js'],
                'client');
});
