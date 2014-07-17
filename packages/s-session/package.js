Package.describe({
  summary: "meteor server session",
  internal: true
});

Package.on_use(function (api) {
  //api.use('jquery');
  var path = Npm.require('path');
  api.use('webapp', 'server');
  //var asset_path = path.join('js');
  api.use('livedata', [ 'server']);
  api.add_files(path.join( 's-session-server.js'), 'server');
  api.add_files(path.join( 's-session-client.js'), 'client');
  api.export('_sessions', 'server');
  // XXX this makes the paths to the icon sets absolute. it needs
  // to be included _after_ the standard bootstrap css so
  // that its styles take precedence.
  //api.add_files(path.join('bootstrap-override.css'), 'client');
  
});








