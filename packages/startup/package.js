Package.describe({
  summary: "Provides Meteor.startup",
  internal: true
});

// XXX hack -- need a way to use a package at bundle time
var _ = require('../../packages/underscore/underscore.js');

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  if (_.indexOf(where, 'client') !== -1)
    api.add_files('startup_client.js', 'client');

  if (_.indexOf(where, 'server') !== -1)
    api.add_files('startup_server.js', 'server');
});
