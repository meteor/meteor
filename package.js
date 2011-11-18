Package.describe({
  summary: "Easy macros for generating DOM elements in Javascript"
});


// the jquery dependency is unfortunate, avoidable, and real
Package.require('jquery');
Package.client_file('html.js');
