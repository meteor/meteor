Package.describe({
  summary: "Front-end framework from Twitter",
  version: "1.0.1"
});

Package.onUse(function (api) {
  api.use('jquery');

  var path = Npm.require('path');
  api.addFiles(path.join('css', 'bootstrap.css'), 'client');
  api.addFiles(path.join('css', 'bootstrap-responsive.css'), 'client');
  api.addFiles(path.join('js', 'bootstrap.js'), 'client');
  api.addFiles(path.join('img', 'glyphicons-halflings.png'), 'client');
  api.addFiles(path.join('img', 'glyphicons-halflings-white.png'), 'client');

  // XXX this makes the paths to the icon sets absolute. it needs
  // to be included _after_ the standard bootstrap css so
  // that its styles take precedence.
  api.addFiles(path.join('css', 'bootstrap-override.css'), 'client');
});
