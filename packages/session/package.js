Package.describe({
  summary: "Session variable",
  environments: ["client", "server"],
  internal: true
});

Package.depend(['underscore', 'deps']);

Package.source('session.js');
