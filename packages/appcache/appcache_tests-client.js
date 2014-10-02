var manifestURL = '/app.manifest';

var appcacheTest = function(cb) {
  return function(test, next) {
    HTTP.get(manifestURL, function (err, res) {
      cb(test, res);
      next();
    });
  };
};

Tinytest.addAsync('appcache - presence', appcacheTest(function(test, manifest) {
  console.log(manifest)
  test.equal(manifest.statusCode, 200, 'manifest not served');
}));

Tinytest.addAsync('appcache - validity', appcacheTest(function(test, manifest) {
  var lines = manifest.content.split("\n");
  console.log(test)
  var i = 0;

  var nextLinesMatch = function(expectedList) {
    _.each(expectedList, function(expected) {
      var testFunc = _.isRegExp(expected) ? "matches" : "equal";
      test[testFunc](lines[i++], expected);
    });
  };

  // Verify header validity
  nextLinesMatch([
    "CACHE MANIFEST",
    "",
    /^#\s[0-9a-f]+$/,
    /^#\s[0-9a-f]+$/,
  ]);
}));
