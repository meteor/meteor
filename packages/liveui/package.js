Package.describe({
  summary: "Skybreak's machinery for making arbitrary templates reactive",
  internal: true
});

Package.require('underscore');
Package.require('livedata');
Package.require('session');
Package.client_file('liveui.js');
