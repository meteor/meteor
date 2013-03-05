var fs = require("fs");
var https = require("https");
var os = require("os");
var path = require("path");
var spawn = require('child_process').spawn;
var url = require("url");

var ProgressBar = require('progress');

var files = require('./files.js');
var warehouse = require('./warehouse.js');

var _ = require('underscore');

// XXX update for engine
var updateMeteor = function () {
  // refuse to update if we're in a git checkout.
  if (!files.usesWarehouse()) {
    console.log("Your Meteor installation is a git checkout. Update it " +
                "manually with 'git pull'.");
    process.exit(1);
  }

  // XXX make errors look good
  var updated = warehouse.fetchLatestRelease();
  if (updated) {
    console.log("Updated Meteor to release " + warehouse.latestRelease());
  } else {
    console.log("Meteor release " + warehouse.latestRelease() +
                " is already the latest release.");
  }

  // XXX update app
};
