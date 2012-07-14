console.log("Upgrade complete.");

try {
  // XXX can't get this from updater.js because in 0.3.7 and before the
  // updater didn't have the right NODE_PATH set. At some point we can
  // remove this and just use updater.CURRENT_VERSION.
  var VERSION = "0.3.8";
  // If the previous version wasn't new enough to pass this argument to us, this
  // will be undefined, which will be OK.
  var oldVersion = process.argv[2];

  if (VERSION !== oldVersion) {
    var fs = require('fs');
    var path = require('path');
    var files = require("../lib/files.js");

    var _ = require("../lib/third/underscore.js");

    var topDir = files.get_dev_bundle();
    var changelogPath = path.join(topDir, 'History.md');

    if (path.existsSync(changelogPath)) {
      var changelogData = fs.readFileSync(changelogPath, 'utf8');
      var changelogSections = changelogData.split(/\n\#\#/);

      var matchingSections = [];
      var found_new = false;
      var found_old = false;

      _.each(changelogSections, function (section) {
        var m = /^\s*v([^\s]+)/.exec(section);
        if (m && m[1] === VERSION) {
          found_new = true;
        } else if (m && m[1] === oldVersion) {
          found_old = true;
        }
        if (found_new && !found_old) {
          matchingSections.push(section.replace(/^\s+/, '').replace(/\s+$/, ''));
        }
      });
      if (found_new) {
        if (!found_old) {
          // We did not find the old version, so rather than print out every version,
          // just print the newest version.
          matchingSections = [matchingSections[0]];
        }
        _.each(matchingSections, function(section) {
          console.log();
          console.log(section);
        });
        console.log();
      }
    }
  }
} catch (err) {
  // don't print a weird error message if something goes wrong.
}
