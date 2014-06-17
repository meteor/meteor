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
// .meteor/finished-upgraders file in the app and runs every upgrader listed
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

// We don't have any upgraders now, but this is an example of how to write
// some.  (It probably makes sense to extract "print this message" or "print
// this message if a package is directly used" into helpers.)
var upgradersByName = {
//   "notices-for-1.7.0": function () {
//     maybePrintNoticeHeader();
//     console.log(
// "1.7.0: Something super awesome happened. You should fix your\n" +
// "       code to make sure it works still.");
//     if (_.has(project.project.getConstraints(), 'accounts-ui')) {
//       console.log(
// "\n" +
// "       Accounts UI has totally changed, yo.");
//     }
//     console.log();
//   },
//   "notices-for-1.7.1": function () {
//     maybePrintNoticeHeader();
//     console.log(
// "1.7.1: Oh we changed our minds again completely, sorry.");
//     console.log();
//   },
//   "notices-for-1.7.2": function () {
//     maybePrintNoticeHeader();
//     console.log(
// "1.7.2: Oh gosh never mind, change all your code again.");
//     console.log();
//   }
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
