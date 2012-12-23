try {
  // XXX can't get this from updater.js because in 0.3.7 and before the
  // updater didn't have the right NODE_PATH set. At some point we can
  // remove this and just use updater.CURRENT_VERSION.
  var VERSION = "0.5.3";

  var fs = require('fs');
  var path = require('path');
  var files = require(path.join(__dirname, "..", "lib", "files.js"));

  var _ = require('underscore');

  var topDir = files.get_dev_bundle();
  var changelogPath = path.join(topDir, 'History.md');

  if (fs.existsSync(changelogPath)) {
    var changelogData = fs.readFileSync(changelogPath, 'utf8');
    var changelogSections = changelogData.split(/\n\#\#/);

    _.each(changelogSections, function (section) {
      var m = /^\s*v([^\s]+)/.exec(section);
      if (m && m[1] === VERSION) {
        section = section.replace(/^\s+/, '').replace(/\s+$/, '');
        console.log();
        console.log(section);
        console.log();
      }
    });
  }
} catch (err) {
  // don't print a weird error message if something goes wrong.
}

console.log("Upgrade complete.");
