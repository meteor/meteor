// XXX rename package 'monitor'?

Package.describe({
  summary: "Dependency mananger to allow reactive callbacks",
  internal: true
});

Package.require('underscore');

Package.client_file('deps.js');
