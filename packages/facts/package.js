Package.describe({
  summary: "Publish internal and custom app statistics"
});

Package.on_use(function (api) {
  api.use(['livedata', 'underscore'], ['client', 'server']);
  api.use(['templating'], ['client']);

  api.add_files('facts.html', ['client']);
  api.add_files('facts.js', ['client', 'server']);
});

// There are no tests, but make Meteor.Facts available in tests.
Package.on_test(function (api) {
  api.use('facts', ['client', 'server']);
});

