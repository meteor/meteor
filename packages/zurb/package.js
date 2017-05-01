Package.describe({
  summary: "Front-end framework from Zurb"
});

Package.on_use(function (api) {
  api.use('jquery');

  var path = Npm.require('path');
  api.add_files(path.join('css', 'normalize.css'), 'client');
  api.add_files(path.join('css', 'foundation.css'), 'client');
  api.add_files(path.join('js', 'foundation.min.js'), 'client');
});
