Package.describe({
  summary: "An XML builder for node.js similar to java-xmlbuilder.",
  version: '2.5.16'
});

Npm.depends({
  'xmlbuilder2': '1.3.0'
});

Package.onUse(function (api) {
  api.addFiles(['xmlbuilder.js'], 'server');

  api.export('XmlBuilder', 'server');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'xmlbuilder', 'underscore']);

  api.addFiles('xmlbuilder_tests.js', 'server');
});