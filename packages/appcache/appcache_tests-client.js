var manifestUrl = '/app.manifest';

var pathRegex = '[a-z0-9_@\\-^:\\?!#$%&+={}/\\[\\]\\.]+';
var versionRegex = '[a-z0-9]+';

var appcacheTest = function(cb) {
  return function(test, next) {
    HTTP.get(manifestUrl, function (err, res) {
      if (err) {
        test.fail(err);
      } else {
        cb(test, res);
      }
      next();
    });
  };
};

Tinytest.addAsync('appcache - presence', appcacheTest(function(test, manifest) {
  test.equal(manifest.statusCode, 200, 'manifest not served');
}));

Tinytest.addAsync('appcache - content type',
  appcacheTest(function(test, manifest) {
    test.equal(manifest.headers['content-type'], 'text/cache-manifest');
}));

Tinytest.addAsync('appcache - validity', appcacheTest(function(test, manifest) {
  var lines = manifest.content.split('\n');
  var i = 0;
  var currentRegex = null, line = null;

  var nextLine = function() {
    return lines[i++];
  }

  var eof = function() {
    return i >= lines.length;
  }

  var nextLineMatches = function(expected, n) {
    n = n || 1;
    _.times(n, function() {
      var testFunc = _.isRegExp(expected) ? 'matches' : 'equal';
      test[testFunc](nextLine(), expected);
    });
  };

  var regExpConstructor = function(/* arguments */) {
    var parts = ['^'].concat(_.toArray(arguments)).concat(['$']);
    return new RegExp(parts.join(''), 'i');
  };

  // Verify header validity
  nextLineMatches('CACHE MANIFEST');
  nextLineMatches('');
  nextLineMatches(regExpConstructor('# ', versionRegex), 2);


  // Verify body validity
  while (! eof()) {
    line = nextLine();

    // There are three distinct sections: 'CACHE', 'FALLBACK', and 'NETWORK'.
    // A section start with its name suffixed by a colon. When we read a new
    // section header, we update the currentRegex expression for the next lines
    // of the section.
    // XXX There is also a 'SETTINGS' section, not used by this package.
    if (line === 'CACHE:' || line === 'NETWORK:')
      currentRegex = regExpConstructor(pathRegex);

    else if (line === 'FALLBACK:')
      currentRegex = regExpConstructor(pathRegex, ' ', pathRegex);

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
}));
