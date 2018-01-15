Package.describe({
  summary: "Ordered traversable dictionary with a mutable ordering",
  version: '1.1.0-rc161.6',
  documentation: null
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.mainModule('ordered_dict.js');
  api.export('OrderedDict');
});
