Package.describe({
  summary: "Unit testing using QUnit"
});

Package.on_use(function (api) {
  api.add_files('qunit.css', 'client');
  api.add_files('qunit.js', 'client');
});
