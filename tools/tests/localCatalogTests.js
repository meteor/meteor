var selftest = require('../selftest.js');
var cata = require('../catalog-local.js');
var fs = require('fs');
var _ = require('underscore');
var buildmessage = require('../buildmessage.js');
var layeredCata = require('../catalog-layered.js');

//TODO
//Tests to write
//Test when the DB is busted
//Test to make sure that the entries are not loaded twice
//getSortedVersions : function(name) --> test result case and make sure it is  []
selftest.define("localCatalogTest", [], function () {
	console.log(exports);
    var lc = new cata.LocalCatalog();
    lc.foobar();
    var messages = buildmessage.capture(function () {
      lc.initialize({localPackageDirs: ["/Users/pascalrapicault/dev/meteor/packages"]});
    });
    if (messages.hasMessages()) {
      process.stderr.write("=> Errors while scanning packages:\n\n");
      process.stderr.write(messages.formatMessages());
    }

    console.log(lc.getAllPackageNames());
    console.log(lc.isLocalPackage("url"));
     var messages = buildmessage.capture(function () {
      lc.rebuildLocalPackages("url");
      lc.getPackage
    });
});


selftest.define("testFunctions", [], function () {
  var lac = new layeredCata.LayeredCatalog();
  var lc = new cata.LocalCatalog();
  var messages = buildmessage.capture(function () {
      lc.initialize({localPackageDirs: ["/Users/pascalrapicault/dev/meteor/packages"]});
    });
  lac.setCatalogs(lc, lc);
  var messages = buildmessage.capture(function () {
    console.log(lac.getAllBuilds("a", "1.0"));
  });
});
