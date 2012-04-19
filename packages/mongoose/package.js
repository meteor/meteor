Package.describe({
  summary: "Mongoose is a MongoDB object modeling tool designed to work in an asynchronous environment",
  internal: false
});

//Will add in client side later if there is an interest for it

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.add_files('mongoose.js', 'server');
});

Package.on_test(function(api, where) {
  api.use('tinytest');
  api.use('test-helpers', 'server');
  api.use('mongoose');

  api.add_files('tests.js', 'server');
});