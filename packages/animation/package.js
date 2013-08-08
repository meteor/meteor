Package.describe({
  summary: "A set of commonly used animation decorators"
});

Package.on_use(function (api) {
  api.export(['AnimatedList']);
  api.use(['jquery', 'ui']);
  api.add_files(['animated_each.js'], 'client');
});
