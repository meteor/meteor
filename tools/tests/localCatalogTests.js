var selftest = require('../selftest.js');
var fs = require('fs');
var _ = require('underscore');
var buildmessage = require('../buildmessage.js');
var catalog = require('../catalog.js');

selftest.define("dumpPreBuilt", [], function () {
	console.log(catalog.uniload.getAllPackageNames());
	console.log(catalog.complete.getAllPackageNames());
});

selftest.define("unitTestCatalog", [], function () {
  //Test getVersion
  var messages = buildmessage.capture(function () {
    console.log(catalog.official.getVersion("accounts-facebook", "1.0.0"));
    console.log(catalog.complete.getVersion("accounts-facebook", "1.0.0"));

    console.log(catalog.official.getVersion("missingPackage", "1.0.0"));
    console.log(catalog.complete.getVersion("missingPackage", "1.0.0"));
  });

  messages = buildmessage.capture(function () {
    console.log(catalog.official.getSortedVersions("accounts-facebook"));
    console.log(catalog.complete.getSortedVersions("accounts-facebook"));

    console.log(catalog.official.getSortedVersions("missingPackage"));
    console.log(catalog.complete.getSortedVersions("missingPackage"));
  });

  messages = buildmessage.capture(function () {
    console.log(catalog.official.getAllBuilds("accounts-base", "1.0.0"));
    console.log(catalog.complete.getAllBuilds("accounts-base", "1.0.0"));

    console.log(catalog.official.getAllBuilds("missingPackage", "1.0.0"));
    console.log(catalog.complete.getAllBuilds("missingPackage", "1.0.0"));
  });

  messages = buildmessage.capture(function () {
    console.log(catalog.official.getAllReleaseTracks());
  });
  
  messages = buildmessage.capture(function () {
    console.log(catalog.official.getDefaultReleaseVersion());
  });

  messages = buildmessage.capture(function () {
    console.log(catalog.official.getLatestMainlineVersion("accounts-base"));
    console.log(catalog.official.getLatestMainlineVersion("missing"));
  });

  messages = buildmessage.capture(function () {
    console.log(catalog.official.getPackage("iron:core"));
    console.log(catalog.complete.getPackage("iron:core"));

    console.log(catalog.official.getPackage("missing"));
    console.log(catalog.complete.getPackage("missing"));
  });

  messages = buildmessage.capture(function () {
    console.log(catalog.official.getReleaseTrack("METEOR"));
    // console.log(catalog.complete.getReleaseTrack("METEOR"));

    console.log(catalog.official.getReleaseTrack("missing"));
    // console.log(catalog.complete.getReleaseTrack("missing"));
  });
 
  messages = buildmessage.capture(function () {
    console.log(catalog.official.getReleaseVersion("METEOR", "0.9.1"));
    // console.log(catalog.complete.getReleaseTrack("METEOR"));

    console.log(catalog.official.getReleaseVersion("missing", "0.9.1"));
    // console.log(catalog.complete.getReleaseTrack("missing"));
  });

  messages = buildmessage.capture(function () {
    console.log(catalog.official.getSortedRecommendedReleaseVersions("METEOR", "0.8.0"));
    // console.log(catalog.complete.getReleaseTrack("METEOR"));

    console.log(catalog.official.getSortedRecommendedReleaseVersions("missing", "0.8.0"));
    // console.log(catalog.complete.getReleaseTrack("missing"));
  });

  messages = buildmessage.capture(function () {
    console.log(catalog.complete.getLocalPackageNames());
  });

  // messages = buildmessage.capture(function () {
  //   console.log(catalog.complete.getBuildsForArches("accounts-base", "1.0.0", "mac"));
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
