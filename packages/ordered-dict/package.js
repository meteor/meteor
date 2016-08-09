Package.describe({
  summary: "Ordered traversable dictionary with a mutable ordering",
  version: '1.0.8',
  documentation: null,
  git: 'https://github.com/meteor/meteor/tree/master/packages/ordered-dict'
});

Package.onUse(function (api) {
  api.use('underscore');
  api.export('OrderedDict');
  api.addFiles('ordered_dict.js', ['client', 'server']);
});
