var _ = require('underscore');
var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files.js');
var bundler = require('../isobuild/bundle.js');

selftest.define("bundle-ignore-files", () => {
  var patterns = bundler.ignoreFiles;
  var inputs = [
    '.git/',
    '.meteor/',
    '.DS_Store',
    '.aaabbb.swp',
    'Thumbs.db',
  ];
  _.each(inputs, (input) => {
    let matched = _.any(patterns, (ptn) => {
      return ptn.test(input);
    });
    selftest.expectEqual(matched, true);
  });
});
