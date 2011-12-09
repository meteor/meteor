Package.describe({
  summary: "Collection of small helper functions (map, each, bind, ...)"
});

// XXX I look forward to that happy day when the user of a package
// specifies whether they want to use it on the client, or the server,
// or both.
Package.client_file('underscore.js');
Package.server_file('underscore.js');
