Package.describe({
  summary: "Experimental system for UI controllers"
});

Package.on_use(function (api) {
  // XXX could avoid hard dependency on 'reload' like 'session' does
  api.use(['spark', 'reactive-dict', 'reload'], 'client');

  api.add_files('controllers.js', 'client');
});

Package.on_test(function (api) {
  api.use(['tinytest']);
});
