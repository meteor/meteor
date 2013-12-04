Package.describe({
  summary: "Handlebars-like template language for Meteor"
});

Package.on_use(function (api) {
  api.export('Spacebars');

  api.use('random');
  api.use('underscore');
  api.use('jsparse');
  api.use('html5-tokenizer');
  api.use('html');
  api.use('ui');
  api.use('minifiers', ['server']);
  api.add_files(['spacebars.js']);
});

Package.on_test(function (api) {
  api.use('underscore');
  api.use('spacebars');
  api.use('tinytest');
  api.add_files('spacebars_tests.js', ['server']);
  api.add_files('compile_tests.js', ['server']);
});
