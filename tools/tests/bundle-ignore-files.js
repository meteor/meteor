const selftest = require('../tool-testing/selftest.js');
const bundler = require('../isobuild/bundler.js');

selftest.define("bundle-ignore-files", async () => {
  const patterns = bundler.ignoreFiles;
  const matchingInputs = [
    '.git/',
    '.meteor/',
    '.DS_Store',
    '.aaabbb.swp',
    'Icon\r',
    'Thumbs.db'
  ];

  for (const input of matchingInputs) {
    await selftest.expectEqual(patterns.some(p => p.test(input)), true);
  }

  const nonMatchingInputs = [
    'Icon',
  ];

  for (const input of nonMatchingInputs) {
    await selftest.expectEqual(patterns.some(p => p.test(input)),false);
  }
});
