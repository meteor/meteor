var selftest = require('../selftest.js');
var files = require('../files.js');

selftest.define("linking to meteor script works correctly on Windows", function () {
  var location =
    '/C/some obscure/location/on disk/with some unicode/Вот тебе и юникод/';
  var script = files._generateScriptLinkToMeteorScript(location);
  var parsedLocation = files._getLocationFromScriptLinkToMeteorScript(script);
  selftest.expectEqual(parsedLocation, location);
});

selftest.define("linking to meteor script works correctly on Windows not absolute", function () {
  var location =
    'some obscure/location/on disk/with some unicode/Вот тебе и юникод/';
  var script = files._generateScriptLinkToMeteorScript(location);
  var parsedLocation = files._getLocationFromScriptLinkToMeteorScript(script);
  selftest.expectEqual(parsedLocation, location);
});


