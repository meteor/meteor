Package.describe({
  summary: "Handlebars-like template language for Meteor"
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  api.use('random', where);
  api.use('underscore', where);
  api.use('jsparse', where);
  api.use('html5-tokenizer', where);
  api.use('ui');
  api.add_files(['spacebars.js'], where);
});

Package.on_test(function (api) {
  api.use('underscore');
  api.use('spacebars');
  api.use('tinytest');
  api.add_files('spacebars_tests.js', ['client', 'server']);
});
