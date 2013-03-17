Package.describe({
  summary: "Handlebar helpers",
  internal: true
});

Package.on_use(function (api, where) {
  api.use(['handlebars'], 'server'); //Needed by helpers for test and live,

  api.add_files('helpers.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use(['tinytest', 
           'test-helpers', 
           'session', 
           'templating',
           'mongo-livedata']);
  
  api.add_files(['helpers_tests.html',
                 'helpers_tests.js',
                 ], 'client');

});
