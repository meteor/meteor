Package.describe({
  summary: "Ordered traversable dictionary with a mutable ordering",
  internal: true
});

Package.on_use(function (api) {
  api.use('underscore');
  api.add_files('ordered_dict.js', ['client', 'server']);
});
