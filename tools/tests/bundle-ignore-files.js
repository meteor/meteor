const selftest = require('../tool-testing/selftest.js');
const bundler = require('../isobuild/bundler.js');

selftest.define("bundle-ignore-files", () => {
  const patterns = bundler.ignoreFiles;
  const matchingInputs = [
    '.git/',
    '.meteor/',
    '.DS_Store',
    '.aaabbb.swp',
    'Thumbs.db'
  ];

  matchingInputs.forEach(input => selftest.expectEqual(patterns.some(p => p.test(input)),true));

  const nonMatchingInputs = [
    '/imports/components/Icon/index.js',
  ];

  nonMatchingInputs.forEach(input => selftest.expectEqual(patterns.some(p => p.test(input)),false));
});
