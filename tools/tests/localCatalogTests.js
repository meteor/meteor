var selftest = require('../selftest.js');
var fs = require('fs');
var _ = require('underscore');
var buildmessage = require('../buildmessage.js');
var catalog = require('../catalog.js');

// Easy to change back to enable console.log
var check = function (v) { /*console.log(v)*/ };

selftest.define("dumpPreBuilt", [], function () {

  check(catalog.uniload.getAllPackageNames());
  check(catalog.complete.getAllPackageNames());
});

selftest.define("unitTestCatalog", [], function () {
  //Test getVersion
  var messages = buildmessage.capture(function () {
    check(catalog.official.getVersion("accounts-facebook", "1.0.0"));
    check(catalog.complete.getVersion("accounts-facebook", "1.0.0"));

    check(catalog.official.getVersion("missingPackage", "1.0.0"));
    check(catalog.complete.getVersion("missingPackage", "1.0.0"));
  });

  messages = buildmessage.capture(function () {
    check(catalog.official.getSortedVersions("accounts-facebook"));
    check(catalog.complete.getSortedVersions("accounts-facebook"));

    check(catalog.official.getSortedVersions("missingPackage"));
    check(catalog.complete.getSortedVersions("missingPackage"));
  });

  messages = buildmessage.capture(function () {
    check(catalog.official.getAllBuilds("accounts-base", "1.0.0"));
    check(catalog.complete.getAllBuilds("accounts-base", "1.0.0"));

    check(catalog.official.getAllBuilds("missingPackage", "1.0.0"));
    check(catalog.complete.getAllBuilds("missingPackage", "1.0.0"));
  });

  messages = buildmessage.capture(function () {
    check(catalog.official.getAllReleaseTracks());
  });
  
  messages = buildmessage.capture(function () {
    check(catalog.official.getDefaultReleaseVersion());
  });

  messages = buildmessage.capture(function () {
    check(catalog.official.getLatestMainlineVersion("accounts-base"));
    check(catalog.official.getLatestMainlineVersion("missing"));
  });

  messages = buildmessage.capture(function () {
    check(catalog.official.getPackage("iron:core"));
    check(catalog.complete.getPackage("iron:core"));

    check(catalog.official.getPackage("missing"));
    check(catalog.complete.getPackage("missing"));
  });

  messages = buildmessage.capture(function () {
    check(catalog.official.getReleaseTrack("METEOR"));
    // check(catalog.complete.getReleaseTrack("METEOR"));

    check(catalog.official.getReleaseTrack("missing"));
    // check(catalog.complete.getReleaseTrack("missing"));
  });
 
  messages = buildmessage.capture(function () {
    check(catalog.official.getReleaseVersion("METEOR", "0.9.1"));
    // check(catalog.complete.getReleaseTrack("METEOR"));

    check(catalog.official.getReleaseVersion("missing", "0.9.1"));
    // check(catalog.complete.getReleaseTrack("missing"));
  });

  messages = buildmessage.capture(function () {
    check(catalog.official.getSortedRecommendedReleaseVersions("METEOR", "0.8.0"));
    // check(catalog.complete.getReleaseTrack("METEOR"));

    check(catalog.official.getSortedRecommendedReleaseVersions("missing", "0.8.0"));
    // check(catalog.complete.getReleaseTrack("missing"));
  });

  messages = buildmessage.capture(function () {
    check(catalog.complete.getLocalPackageNames());
  });

  // messages = buildmessage.capture(function () {
  //   check(catalog.complete.getBuildsForArches("accounts-base", "1.0.0", "mac"));
  // });

	//getAllPackageNames
	//getBuildWithPreciseBuildArchitectures
	//getForgottenECVs
	//getLoadPathForPackage

	
});
// //TODO
// //Tests to write
// //Test when the DB is busted
// //Test to make sure that the entries are not loaded twice
// //getSortedVersions : function(name) --> test result case and make sure it is  []
// selftest.define("localCatalogTest", [], function () {
// 	console.log(exports);
//     var lc = new cata.LocalCatalog();
//     lc.foobar();
//     var messages = buildmessage.capture(function () {
//       lc.initialize({localPackageDirs: ["/Users/pascalrapicault/dev/meteor/packages"]});
//     });
//     if (messages.hasMessages()) {
//       process.stderr.write("=> Errors while scanning packages:\n\n");
//       process.stderr.write(messages.formatMessages());
//     }

//     console.log(lc.getAllPackageNames());
//     console.log(lc.isLocalPackage("url"));
//      var messages = buildmessage.capture(function () {
//       lc.rebuildLocalPackages("url");
//       // lc.getPackage
//     });
// });


// selftest.define("testFunctions", [], function () {
//   var lac = new catalog.LayeredCatalog();
//   var lc = new cata.LocalCatalog();
//   var messages = buildmessage.capture(function () {
//       lc.initialize({localPackageDirs: ["/Users/pascalrapicault/dev/meteor/packages"]});
//     });
//   lac.setCatalogs(lc, lc);
//   var messages = buildmessage.capture(function () {
//     console.log(lac.getAllBuilds("a", "1.0"));
//   });
// });

// selftest.define("testBootstrapCatalog", [], function () {
//   var lac = new catalog.LayeredCatalog();
//   var lc = new cata.LocalCatalog();
//   var messages = buildmessage.capture(function () {
//       lc.initialize({localPackageDirs: ["/Users/pascalrapicault/.meteor/packages/meteor-tool/"]});
//     });
//   lac.setCatalogs(lc, lc);
//   var messages = buildmessage.capture(function () {
//     console.log(lac.getAllBuilds("a", "1.0"));
//   });
// });
