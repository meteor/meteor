Package.describe({
  summary: "Mongoose is a MongoDB object modeling tool designed to work in an asynchronous environment",
  internal: false
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.add_files('mongoose.js', 'server');
});
