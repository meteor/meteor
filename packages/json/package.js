Package.describe({
  summary: "Provides JSON.stringify and JSON.parse for older browsers",
  environments: ["client", "server"],
  internal: true
});

// We need to figure out how to serve this file only to browsers that
// don't have JSON.stringify (eg, IE7 and earlier -- or is that IE8?)

Package.source('json2.js');
