Package.describe({
  summary: "A set of commonly used animation decorators"
});

Package.on_use(function (api) {
  api.export('AnimatedEach');
  api.use('jquery');
  api.add_files(['animated_each.js'], 'client');
});
