// XXX this is hella confusing. this package really only has the
// handlebars *runtime*, for precompiled templates. so really it is an
// internal package that should get shipped down to the client iff you
// have a precompiled handlebars template in your project.

Package.describe({
  summary: "Simple semantic templating language",
  environments: ["client"]
});


require('../../packages/handlebars/parse.js'); // XXX lame!!
// XXX should only be sent if we have handlebars templates in the app..
Package.source('evaluate.js');

// XXX lots more to do here .. registering this a templating engine,
// making it the default default, providing the compiler code,
// depending on the node package (or packaging the compiler
// ourselves..)

Package.depend('underscore');