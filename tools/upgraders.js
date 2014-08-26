var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var project = require('./project.js');

// This file implements "upgraders" --- functions which upgrade a Meteor app to
// a new version. Each upgrader has a name (registered in upgradersByName).
//
// You can test upgraders by running "meteor run-upgrader myupgradername".
//
// Upgraders are run automatically by "meteor update". It looks at the
// .meteor/.finished-upgraders file in the app and runs every upgrader listed
// here that is not in that file; then it appends their names to that file.
// Upgraders are run in the order they are listed in upgradersByName below.

var printedNoticeHeaderThisProcess = false;
var maybePrintNoticeHeader = function () {
  if (printedNoticeHeaderThisProcess)
    return;
  console.log();
  console.log("-- Notice --");
  console.log();
  printedNoticeHeaderThisProcess = true;
};

var upgradersByName = {
   "notices-for-0.9.0": function () {
     maybePrintNoticeHeader();
     if (fs.existsSync(path.join(project.project.rootDir, 'smart.json'))) {
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
     // How to do package-specific notices:
//     if (_.has(project.project.getConstraints(), 'accounts-ui')) {
//       console.log(
// "\n" +
// "       Accounts UI has totally changed, yo.");
//     }
    console.log();
  }
};

exports.runUpgrader = function (upgraderName) {
  // This should only be called from the hidden run-upgrader command or by
  // "meteor update" with an upgrader from one of our releases, so it's OK if
  // error handling is just an exception.
  if (! _.has(upgradersByName, upgraderName))
    throw new Error("Unknown upgrader: " + upgraderName);
  upgradersByName[upgraderName]();
};

exports.upgradersToRun = function () {
  var ret = [];
  var finishedUpgraders = project.project.getFinishedUpgraders();
  // This relies on the fact that Node guarantees object iteration ordering.
  _.each(upgradersByName, function (func, name) {
    if (!_.contains(finishedUpgraders, name)) {
      ret.push(name);
    }
  });
  return ret;
};

exports.allUpgraders = function () {
  return _.keys(upgradersByName);
};
