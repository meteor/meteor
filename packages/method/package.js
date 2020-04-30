Package.describe({
  name: 'method',
  version: '0.1.0',
  summary: 'Advanced meteor methods, with more control',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.imply(['meteor', 'ddp']);
});

Package.onTest(function (api) {
  api.use("tinytest");
  api.use("ecmascript");
  api.mainModule("method_tests.js");
});
