Package.describe({
  summary: "Ordered traversable dictionary with a mutable ordering",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.use('underscore');
  api.export('OrderedDict');
  api.add_files('ordered_dict.js', ['client', 'server']);
});
