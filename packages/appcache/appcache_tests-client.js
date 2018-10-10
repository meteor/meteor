const manifestUrl = '/app.manifest';

const appcacheTest = (name, cb) => {
  Tinytest.addAsync(`appcache - ${name}`, (test, next) => {
    HTTP.get(manifestUrl, (err, res) => {
      err ? test.fail(err) : cb(test, res);
      next();
    });
  });
};


// Verify that the code status of the HTTP response is "OK"
appcacheTest('presence', (test, manifest) =>
  test.equal(manifest.statusCode, 200, 'manifest not served'));


// Verify the content-type HTTP header
appcacheTest('content type', (test, manifest) =>
  test.equal(manifest.headers['content-type'], 'text/cache-manifest'));


// Verify that each section header is only set once.
appcacheTest('sections uniqueness', (test, manifest) => {
  const { content } = manifest;
  const mandatorySectionHeaders = ['CACHE:', 'NETWORK:', 'FALLBACK:'];
  const optionalSectionHeaders = ['SETTINGS'];
  const allSectionHeaders = [
    ...mandatorySectionHeaders,
    ...optionalSectionHeaders.filter(
      header => !mandatorySectionHeaders.includes(header)
    ),
  ];
  allSectionHeaders.forEach(sectionHeader => {
    const globalSearch = new RegExp(sectionHeader, "g");
    const matches = content.match(globalSearch) || [];
    test.isTrue(matches.length <= 1, `${sectionHeader} is set twice`);
    if (mandatorySectionHeaders.includes(sectionHeader)) {
      test.isTrue(matches.length == 1, `${sectionHeader} is not set`);
    }
  });
});


// Verify the content of the header and of each section of the manifest using
// regular expressions. Regular expressions matches malformed URIs but that's
// not what we're trying to catch here (the user is free to add its own content
// in the manifest -- even malformed).
appcacheTest('sections validity', (test, manifest) => {
  const lines = manifest.content.split('\n');
  let i = 0;
  let currentRegex = null;
  let line = null;

  const nextLine = () => lines[i++];

  const eof = () => i >= lines.length;

  const nextLineMatches = (expected, n) => {
    n = n || 1;
    for(let j = 0; j < n; j++) {
      const testFunc = toString.call(expected) === '[object RegExp]' ?
        'matches' :
        'equal';
      test[testFunc](nextLine(), expected);
    }
  };

  // Verify header validity
  nextLineMatches('CACHE MANIFEST');
  nextLineMatches('');
  nextLineMatches(/^# [a-z0-9]+$/i, 2);


  // Verify body validity
  while (! eof()) {
    line = nextLine();

    // There are three distinct sections: 'CACHE', 'FALLBACK', and 'NETWORK'.
    // A section start with its name suffixed by a colon. When we read a new
    // section header, we update the currentRegex expression for the next lines
    // of the section.
    // XXX There is also a 'SETTINGS' section, not used by this package. If this
    // section is used, the test will fail.
    if (line === 'CACHE:' || line === 'NETWORK:')
      currentRegex = /^\S+$/;

    else if (line === 'FALLBACK:')
      currentRegex = /^\S+ \S+$/;

    // Blank lines and lines starting with a `#` (comments) are valid
    else if (line == '' || line.match(/^#.+/))
      continue;

    // Outside sections, only blanks lines and comments are valid
    else if (currentRegex === null)
      test.fail(`Invalid line ${i}: ${line}`);

    // Inside a section, a star is a valid expression
    else if (line === '*')
      continue;

    // If it is not a blank line, not a comment, and not a header it must
    // match the current section format
    else
      test.matches(line, currentRegex, `line ${i}`);
  }
});


// Verify that resources declared on the server with the `onlineOnly` parameter
// are present in the network section of the manifest. The `appcache` package
// also automatically add the manifest (`app.manifest`) add the star symbol to
// this list and therefore we also check the presence of these two elements.
appcacheTest('network section content', (test, manifest) => {
  const shouldBePresentInNetworkSection = [
    "/app.manifest",
    "/online/",
    "/bigimage.jpg",
    "/largedata.json",
    "*"
  ];
  const lines = manifest.content.split('\n');
  const startNetworkSection = lines.indexOf('NETWORK:');

  // We search the end of the 'NETWORK:' section by looking at the beginning
  // of any potential other section. By default we set this value to
  // `lines.length - 1` which is the index of the last line.
  const otherSections = ['CACHE:', 'FALLBACK:', 'SETTINGS'];
  const endNetworkSection = otherSections.reduce((min, sectionName) => {
    const position = lines.indexOf(sectionName);
    return position > startNetworkSection && position < min ? position : min;
  }, lines.length - 1);

  // We remove the first line because it's the 'NETWORK:' header line.
  const networkLines = lines.slice(startNetworkSection + 1, endNetworkSection);

  shouldBePresentInNetworkSection.forEach(
    item => test.include(networkLines, item)
  );
});
