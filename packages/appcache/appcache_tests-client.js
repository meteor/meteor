var manifestUrl = '/app.manifest';

var appcacheTest = function (name, cb) {
  Tinytest.addAsync('appcache - ' + name, function (test, next) {
    HTTP.get(manifestUrl, function (err, res) {
      if (err) {
        test.fail(err);
      } else {
        cb(test, res);
      }
      next();
    });
  });
};


// Verify that the code status of the HTTP response is "OK"
appcacheTest('presence', function (test, manifest) {
  test.equal(manifest.statusCode, 200, 'manifest not served');
});


// Verify the content-type HTTP header
appcacheTest('content type', function (test, manifest) {
  test.equal(manifest.headers['content-type'], 'text/cache-manifest');
});


// Verify that each section header is only set once.
appcacheTest('sections uniqueness', function (test, manifest) {
  var content = manifest.content;
  var mandatorySectionHeaders = ['CACHE:', 'NETWORK:', 'FALLBACK:'];
  var optionalSectionHeaders = ['SETTINGS'];
  _.each(_.union(mandatorySectionHeaders, optionalSectionHeaders),
         function (sectionHeader) {
           var globalSearch = new RegExp(sectionHeader, "g");
           var matches = content.match(globalSearch) || [];
           test.isTrue(matches.length <= 1, sectionHeader + ' is set twice');
           if (_.contains(mandatorySectionHeaders, sectionHeader)) {
             test.isTrue(matches.length == 1, sectionHeader + ' is not set');
           }
         });
});


// Verify the content of the header and of each section of the manifest using
// regular expressions. Regular expressions matches malformed URIs but that's
// not what we're trying to catch here (the user is free to add its own content
// in the manifest -- even malformed).
appcacheTest('sections validity', function (test, manifest) {
  var lines = manifest.content.split('\n');
  var i = 0;
  var currentRegex = null, line = null;

  var nextLine = function () {
    return lines[i++];
  };

  var eof = function () {
    return i >= lines.length;
  };

  var nextLineMatches = function (expected, n) {
    n = n || 1;
    _.times(n, function () {
      var testFunc = _.isRegExp(expected) ? 'matches' : 'equal';
      test[testFunc](nextLine(), expected);
    });
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
      test.fail('Invalid line ' + i + ': ' + line);

    // Inside a section, a star is a valid expression
    else if (line === '*')
      continue;

    // If it is not a blank line, not a comment, and not a header it must
    // match the current section format
    else
      test.matches(line, currentRegex, 'line ' + i);
  }
});


// Verify that resources declared on the server with the `onlineOnly` parameter
// are present in the network section of the manifest. The `appcache` package
// also automatically add the manifest (`app.manifest`) add the star symbol to
// this list and therefore we also check the presence of these two elements.
appcacheTest('network section content', function (test, manifest) {
  var shouldBePresentInNetworkSection = [
    "/app.manifest",
    "/online/",
    "/bigimage.jpg",
    "/largedata.json",
    "*"
  ];
  var lines = manifest.content.split('\n');
  var startNetworkSection = lines.indexOf('NETWORK:');

  // We search the end of the 'NETWORK:' section by looking at the beginning
  // of any potential other section. By default we set this value to
  // `lines.length - 1` which is the index of the last line.
  var otherSections = ['CACHE:', 'FALLBACK:', 'SETTINGS'];
  var endNetworkSection = _.reduce(otherSections, function (min, sectionName) {
    var position = lines.indexOf(sectionName);
    return position > startNetworkSection && position < min ? position : min;
  }, lines.length - 1);

  // We remove the first line because it's the 'NETWORK:' header line.
  var networkLines = lines.slice(startNetworkSection + 1, endNetworkSection);

  _.each(shouldBePresentInNetworkSection, function (item) {
    test.include(networkLines, item);
  });
});
