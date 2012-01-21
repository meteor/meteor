// XXX rename package?

Package.describe({
  summary: "Dependency mananger to allow reactive callbacks",
  environments: ["client", "server"],
  internal: true
});

Package.depend('underscore');
Package.source('deps.js');
