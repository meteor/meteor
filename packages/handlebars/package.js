Package.describe({
  summary: "Simple semantic templating language",
  internal: true
});

Npm.depends({handlebars: '1.0.7'});

Package.on_use(function (api) {
  api.use('underscore');
  api.use('spark', 'client');

  api.exportSymbol('Handlebars');

  // XXX these should be split up into two different slices, not
  // different code with totally different APIs that is sent depending
  // on the architecture
  api.add_files('parse-handlebars.js', 'server');
  api.add_files('evaluate-handlebars.js', 'client');

  // XXX This package has been folded into the 'templating' package
  // for now. Historically, you could see it in your package list
  // (because it didn't have internal: true, which it probably should
  // have), but adding it didn't do anything (because it just
  // contained the handlebars precompiler and runtime, not any
  // functions you could call yourself.) So leave it around as an
  // empty package for the moment so as to not break the projects of
  // anyone that happened to type 'meteor add handlebars' because they
  // thought they had to.
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('underscore');
});
