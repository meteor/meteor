// XXX this is hella confusing. this package really only has the
// handlebars *runtime*, for precompiled templates. so really it is an
// internal package that should get shipped down to the client iff you
// have a precompiled handlebars template in your project.

var path = require('path');

Package.describe({
  summary: "Simple semantic templating language"
});

Package.require('parse.js'); // needed at bundle time

Package.on_use(function (api) {
  // XXX should only be sent if we have handlebars templates in the app..
  api.add_files('evaluate.js', 'client');
  api.add_files('parse.js', 'server'); // needed on server for tests

  api.use('underscore', 'client');
});

// XXX lots more to do here .. registering this a templating engine,
// making it the default default, providing the compiler code,
// depending on the node package (or packaging the compiler
// ourselves..)
