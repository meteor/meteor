Package.describe({
  summary: "Provides Meteor.startup",
  environments: ["client", "server"],
  internal: true
});

// XXX this loads the package on BOTH the client and the server if
// EITHER was requested.

Package.source({
  client: 'startup_client.js',
  server: 'startup_server.js'
});
