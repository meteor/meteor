Package.describe({
  summary: "Ordered traversable dictionary with a mutable ordering",
  version: '1.2.0-rc300.1',
  documentation: null
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.mainModule('ordered_dict.js');
  api.export('OrderedDict');
});
