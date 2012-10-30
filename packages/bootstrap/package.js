var path = require('path');

Package.describe({
  summary: "UX/UI framework from Twitter"
});

Package.on_use(function (api) {
  api.add_files(path.join('css', 'bootstrap.css'), 'client');
  api.add_files(path.join('css', 'bootstrap-responsive.css'), 'client');
  api.add_files(path.join('js', 'bootstrap.js'), 'client');
  api.add_files(path.join('img', 'glyphicons-halflings.png'), 'client');
  api.add_files(path.join('img', 'glyphicons-halflings-white.png'), 'client');

  // XXX this makes the paths to the icon sets absolute. it needs
  // to be included _after_ the standard bootstrap css so
  // that its styles take precedence.
  api.add_files(path.join('css', 'bootstrap-override.css'), 'client');
});
