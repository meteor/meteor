Package.describe({
  summary: "Easy macros for generating DOM elements in Javascript",
  environments: ["client"]
});

// the jquery dependency is unfortunate, avoidable, and real
Package.depend('jquery');
Package.source('html.js');
