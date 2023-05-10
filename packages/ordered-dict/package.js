Package.describe({
  summary: "Ordered traversable dictionary with a mutable ordering",
  version: '2.0.0-alpha300.3',
  documentation: null
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.mainModule('ordered_dict.js');
  api.export('OrderedDict');
});
