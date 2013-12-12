Package.describe({
  summary: "Handlebars-like template language for Meteor"
});

Package.on_use(function (api) {
  api.export('Spacebars');

  // we attach stuff to the global symbol `HTML`, exported
  // by `htmljs` via `html`, so we both use and effectively
  // imply it.
  // XXX Should separate out the Spacebars runtime support
  // from the Spacebars compiler so we don't need html
  // at runtime.
  api.use('html');
  api.imply('html');

  api.use('underscore');
  api.use('jsparse');
  api.use('html');
  api.use('ui');
  api.use('minifiers', ['server']);
  api.add_files(['tojs.js', 'spacebars.js']);
});

Package.on_test(function (api) {
  api.use('underscore');
  api.use('spacebars');
  api.use('tinytest');
  api.add_files('spacebars_tests.js', ['server']);
  api.add_files('compile_tests.js', ['server']);
});
