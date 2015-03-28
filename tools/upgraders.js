/* eslint no-console: 0 */

var _ = require('underscore');
var files = require('./files.js');
var Console = require('./console.js').Console;

// This file implements "upgraders" --- functions which upgrade a Meteor app to
// a new version. Each upgrader has a name (registered in upgradersByName).
//
// You can test upgraders by running "meteor admin run-upgrader myupgradername".
//
// Upgraders are run automatically by "meteor update". It looks at the
// .meteor/.finished-upgraders file in the app and runs every upgrader listed
// here that is not in that file; then it appends their names to that file.
// Upgraders are run in the order they are listed in upgradersByName below.
//
// Upgraders receive a projectContext that has been fully prepared for build.

var printedNoticeHeaderThisProcess = false;
var maybePrintNoticeHeader = function () {
  if (printedNoticeHeaderThisProcess)
    return;
  console.log();
  console.log("-- Notice --");
  console.log();
  printedNoticeHeaderThisProcess = true;
};

// How to do package-specific notices:
// (a) A notice that occurs if a package is used indirectly or directly.
//     if (projectContext.packageMap.getInfo('accounts-ui')) {
//       console.log(
// "\n" +
// "       Accounts UI has totally changed, yo.");
//     }
//
// (b) A notice that occurs if a package is used directly.
//     if (projectContext.projectConstraintsFile.getConstraint('accounts-ui')) {
//       console.log(
// "\n" +
// "       Accounts UI has totally changed, yo.");
//     }

var upgradersByName = {
   "notices-for-0.9.0": function (projectContext) {
     maybePrintNoticeHeader();

     var smartJsonPath =
       files.pathJoin(projectContext.projectDir, 'smart.json');

     if (files.exists(smartJsonPath)) {
       // Meteorite apps:
       console.log(
"0.9.0: Welcome to the new Meteor package system! You can now add any Meteor\n" +
"       package to your app (from more than 1800 packages available on the\n" +
"       Meteor Package Server) just by typing 'meteor add <packagename>', no\n" +
"       Meteorite required.\n" +
"\n" +
"       It looks like you have been using Meteorite with this project. To\n" +
"       migrate your project automatically to the new system:\n" +
"         (1) upgrade your Meteorite with 'npm install -g meteorite', then\n" +
"         (2) run 'mrt migrate-app' inside the project.\n" +
"       Having done this, you no longer need 'mrt' and can just use 'meteor'.\n");
     } else {
       // Non-Meteorite apps:
       console.log(
"0.9.0: Welcome to the new Meteor package system! You can now add any Meteor\n" +
"       package to your app (from more than 1800 packages available on the\n" +
"       Meteor Package Server) just by typing 'meteor add <packagename>'. Check\n" +
"       out the available packages by typing 'meteor search <term>' or by\n" +
"       visiting atmospherejs.com.\n");
     }
    console.log();
  },

  "notices-for-0.9.1": function () {
    maybePrintNoticeHeader();
    console.log(
"0.9.1: Meteor 0.9.1 includes changes to the Blaze API, in preparation for 1.0.\n" +
"       Many previously undocumented APIs are now public and documented. Most\n" +
"       changes are backwards compatible, except that templates can no longer\n" +
"       be named \"body\" or \"instance\".\n");
    console.log();
  },

  // In 0.9.4, the platforms file contains "server" and "browser" as platforms,
  // and before it only had "ios" and/or "android". We auto-fix that in
  // PlatformList anyway, but we also need to pull platforms from the old
  // cordova-platforms filename.
  "0.9.4-platform-file": function (projectContext) {
    var oldPlatformsPath =
      files.pathJoin(projectContext.projectDir, ".meteor", "cordova-platforms");

    try {
      var oldPlatformsFile = files.readFile(oldPlatformsPath);
    } catch (e) {
      // If the file doesn't exist, there's no transition to do.
      if (e && e.code === 'ENOENT')
        return;
      throw e;
    }
    var oldPlatforms = _.compact(_.map(
      files.splitBufferToLines(oldPlatformsFile), files.trimSpaceAndComments));
    // This method will automatically add "server" and "browser" and sort, etc.
    projectContext.platformList.write(oldPlatforms);
    files.unlink(oldPlatformsPath);
  },

  "notices-for-facebook-graph-api-2": function (projectContext) {
    // Note: this will print if the app has facebook as a dependency, whether
    // direct or indirect. (This is good, since most apps will be pulling it in
    // indirectly via accounts-facebook.)
    if (projectContext.packageMap.getInfo('facebook')) {
      maybePrintNoticeHeader();
      Console.info(
        "This version of Meteor now uses version 2.2 of the Facebook API",
        "for authentication, instead of 1.0. If you use additional Facebook",
        "API methods beyond login, you may need to request new",
        "permissions.\n\n",
        "Facebook will automatically switch all apps to API",
        "version 2.0 on April 30th, 2015. Please make sure to update your",
        "application's permissions and API calls by that date.\n\n",
        "For more details, see",
        "https://github.com/meteor/meteor/wiki/Facebook-Graph-API-Upgrade",
        Console.options({ bulletPoint: "1.0.5: " })
      );
    }
  }

  ////////////
  // PLEASE. When adding new upgraders that print mesasges, follow the
  // examples for 0.9.0 and 0.9.1 above. Specifically, formatting
  // should be:
  //
  // 1.x.y: Lorem ipsum messages go here...
  //        ...and linewrapped on the right column
  //
  // (Or just use Console.info with bulletPoint)
  ////////////
};

exports.runUpgrader = function (projectContext, upgraderName) {
  // This should only be called from the hidden run-upgrader command or by
  // "meteor update" with an upgrader from one of our releases, so it's OK if
  // error handling is just an exception.
  if (! _.has(upgradersByName, upgraderName))
    throw new Error("Unknown upgrader: " + upgraderName);
  upgradersByName[upgraderName](projectContext);
};

exports.upgradersToRun = function (projectContext) {
  var ret = [];
  var finishedUpgraders = projectContext.finishedUpgraders.readUpgraders();
  // This relies on the fact that Node guarantees object iteration ordering.
  _.each(upgradersByName, function (func, name) {
    if (! _.contains(finishedUpgraders, name)) {
      ret.push(name);
    }
  });
  return ret;
};

exports.allUpgraders = function () {
  return _.keys(upgradersByName);
};
