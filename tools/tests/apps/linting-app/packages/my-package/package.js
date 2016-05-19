Package.describe({
  summary: "test local package for using linting"
});

Package.onUse(function (api) {
  api.addFiles('package-client.js', 'client');
  api.addFiles('package-server.js', 'server');
  api.addFiles('.jshintrc');

  api.use(['jshint', 'minimongo']);
});
