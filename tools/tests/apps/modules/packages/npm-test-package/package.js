// This can not be combined in the modules-test-package
// Since the client of that one is supposed to be lazily loaded
// Otherwise the css modules test break
Package.describe({
  name: 'npm-test-package',
  version: '0.0.1',
  summary: 'local test package',
  documentation: 'README.md'
});

Npm.depends({
  "cheerio": "0.22.0",
  "@sebak/lodashuser": "1.0.0",
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.mainModule("common.js");
});
