// Takes an existing release (eg 0.7.5-rc3) and sets up the files to make it the
// latest stable release, with a new name (eg 0.7.5). This involves:
//  - building bootstrap tarballs
//  - building new FOO.release.json and FOO.notices.json files for it
//  - building a new (global) manifest.json file for it
// These files are placed in the dist/ directory in your Meteor checkout,
// along with a shell script, bless-it-now.sh, which actually uploads
// the files to the correct place in s3.
//
// Run this script as:
//   $ node bless-release.js RC_NAME BLESSED_RELEASE_NAME
//
// Before running this, RC_NAME should be an existing (tested) release, and
// BLESSED_RELEASE_NAME should not be an existing release.  The files
// scripts/admin/notices.json and scripts/admin/banner.txt should be updated to
// reflect the changes that need to be printed on "meteor update" and the text
// that should be printed during a "meteor run" respectively.

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var Fiber = require('fibers');
var Future = require('fibers/future');
var _ = require('underscore');

var files = require('../../tools/files.js');
var httpHelpers = require('../../tools/http-helpers.js');
var warehouse = require('../../tools/warehouse.js');

var PLATFORMS = [
  'Darwin_x86_64',
  'Linux_i686',
  'Linux_x86_64'
];

var die = function (msg) {
  console.error(msg);
  process.exit(1);
};

var doOrDie = function (errorMessage, f) {
  try {
    return f();
  } catch (e) {
    die(errorMessage);
  }
};

// runs a command, returns stdout.
// XXX should we have a smart package for these? 'process'?
var execFileSync = function (binary, args) {
  return Future.wrap(function(cb) {
    var cb2 = function(err, stdout, stderr) { cb(err, stdout); };
    child_process.execFile(binary, args, cb2);
  })().wait();
};

var getWarehouseFile = function (path, json) {
  return httpHelpers.getUrl({
    url: "https://s3.amazonaws.com/meteor-warehouse/" + path,
    json: json
  });
};

var getReleaseManifest = function (release) {
  return getWarehouseFile("releases/" + release + ".release.json", true);
};

var checkReleaseDoesNotExistYet = function (release) {
  try {
    getReleaseManifest(release);
  } catch (e) {
    return;
  }
  die("Release " + release + " already exists!");
};

// Writes out a JSON file, pretty-printed and read-only.
var writeJSONFile = function (path, jsonObject) {
  fs.writeFileSync(path, JSON.stringify(jsonObject, null, 2), {mode: 0444});
};
var readJSONFile = function (path) {
  return JSON.parse(fs.readFileSync(path));
};

var distDirectory, warehouseDirectory;

// Deletes $SOURCE_ROOT/dist and builds out a .meteor inside it containing
// everything but packages and tools.
var resetDistDirectory = function (blessedReleaseName, rcManifest, notices) {
  distDirectory = path.resolve(__dirname, '..', '..', 'dist');
  console.log("Building in " + distDirectory);
  files.rm_recursive(distDirectory);
  fs.mkdirSync(distDirectory);
  warehouseDirectory = path.join(distDirectory, '.meteor');
  writeJSONFile(path.join(distDirectory, blessedReleaseName + '.release.json'),
                rcManifest);
  writeJSONFile(path.join(distDirectory, blessedReleaseName + '.notices.json'),
                notices);
};

var makeWarehouseStructure = function (blessedReleaseName, rcManifest, notices) {
  files.rm_recursive(warehouseDirectory);
  files.mkdir_p(path.join(warehouseDirectory, 'releases'), 0755);
  fs.mkdirSync(path.join(warehouseDirectory, 'packages'), 0755);
  fs.mkdirSync(path.join(warehouseDirectory, 'tools'), 0755);
  fs.symlinkSync('tools/latest/bin/meteor',
                 path.join(warehouseDirectory, 'meteor'));
  fs.symlinkSync(blessedReleaseName + '.release.json',
                 path.join(warehouseDirectory, 'releases', 'latest'));
  fs.symlinkSync(rcManifest.tools,
                 path.join(warehouseDirectory, 'tools', 'latest'));
  writeJSONFile(path.join(warehouseDirectory, 'releases',
                          blessedReleaseName + '.release.json'),
                rcManifest);
  writeJSONFile(path.join(warehouseDirectory, 'releases',
                          blessedReleaseName + '.notices.json'),
                notices);
};

var downloadPackages = function (packages, platform) {
  console.log("Downloading packages for " + platform);
  warehouse.downloadPackagesToWarehouse(
    packages, platform, warehouseDirectory, true);
};

var downloadTools = function (toolsVersion, platform) {
  console.log("Downloading tools for " + platform);
  warehouse.downloadToolsToWarehouse(
    toolsVersion, platform, warehouseDirectory, true);
};

var bootstrapTarballFilename = function (platform) {
  return "meteor-bootstrap-" + platform + ".tar.gz";
};

var makeBootstrapTarball = function (platform) {
  console.log("Creating bootstrap tarball for " + platform);
  var tarballName = bootstrapTarballFilename(platform);
  // files.createTarball puts weird NODETAR tags in it which causes Linux tar to
  // print warnings on extraction. Even BSD tar (the default Mac tar) puts some
  // weird SCHILY tags on it. So use gnutar, which is installed on Macs.
  execFileSync(fs.existsSync("/usr/bin/gnutar") ? "gnutar" : "tar",
               ["czf",
                path.join(distDirectory, tarballName),
                "-C", path.dirname(warehouseDirectory),
                path.basename(warehouseDirectory)]);
};

var writeGlobalManifest = function (blessedReleaseName, banner) {
  console.log("Writing global manifest");
  var globalManifest = {
    releases: {
      stable: {
        version: blessedReleaseName,
        banner: banner
      }
    },
    // The rest is entirely for the sake of pre-Engine Meteor.
    version: "0.6.0",
    deb_version: "0.6.0-1",
    rpm_version: "0.6.0-1",
    urlbase: "https://d3sqy0vbqsdhku.cloudfront.net"
  };

  writeJSONFile(path.join(distDirectory, 'manifest.json'), globalManifest);
};


var writeBigRedButton = function (blessedReleaseName, gitTagSourceSha, gitTag) {
  var s3Files = _.map(PLATFORMS, function (platform) {
    return [bootstrapTarballFilename(platform),
            'meteor-warehouse/bootstrap/' + blessedReleaseName];
  });
  s3Files.push([blessedReleaseName + '.notices.json',
                'meteor-warehouse/releases']);
  s3Files.push([blessedReleaseName + '.release.json',
                'meteor-warehouse/releases']);
  s3Files.push(['manifest.json', 'com.meteor.static/update']);
  var scriptText =
        "#!/bin/bash\n" +
        "# Wow! It's time to release Meteor " + blessedReleaseName + "!\n" +
        "# Look at the contents of this directory, cross your fingers, and\n" +
        "# run this script!\n\n" +
        "set -e\n" +
        "cd '" + distDirectory + "'\n" +
        "echo 'Blessing Meteor " + blessedReleaseName + "'\n\n";
  scriptText = scriptText + _.map(s3Files, function (f) {
    return "s3cmd -P put " + f[0] + " s3://" + f[1] + "/\n";
  }).join('');

  scriptText = scriptText +
    "git tag " + gitTag + " " + gitTagSourceSha + "\n" +
    "git push git@github.com:meteor/meteor.git refs/tags/" + gitTag + "\n" +
    "echo 'Gesundheit!'\n";

  var scriptFilename = path.join(distDirectory, "big-red-button.sh");
  fs.writeFileSync(scriptFilename, scriptText);
  fs.chmodSync(scriptFilename, 0755);

  console.log("Take a look at the dist/ directory in your checkout.");
  console.log("If everything looks OK, run the big-red-button.sh you'll " +
              "find there.");
};


var main = function () {
  // node and the script itself are included in process.argv
  if (process.argv.length !== 4) {
    die("usage: node bless-release.js RC_NAME BLESSED_RELEASE_NAME");
  }

  var rcName = process.argv[2];
  var blessedReleaseName = process.argv[3];

  var rcManifest = doOrDie("Release " + rcName + " not found.", function () {
    return getReleaseManifest(rcName);
  });

  checkReleaseDoesNotExistYet(blessedReleaseName);

  var gitTag = "release/" + blessedReleaseName;
  // Check to see if the release name is going to work in git.
  doOrDie("Bad release name " + blessedReleaseName, function () {
    execFileSync("git", ["check-ref-format", "--allow-onelevel", gitTag]);
  });

  var gitTagSource = /^[0-9a-f]{40}$/.test(rcName)
        ? rcName : 'release/' + rcName;
  var gitTagSourceSha = doOrDie("Release " + rcName + " not in git", function () {
    return execFileSync(
      "git", ["rev-parse", "--verify", gitTagSource]).replace(/\s+/, '');
  });

  var noticesFilename = path.resolve(__dirname, 'notices.json');
  var notices = doOrDie("Can't read notices file " + noticesFilename, function () {
    return readJSONFile(noticesFilename);
  });

  // Every "official" release needs to be in notices.json, even those without
  // notices, so that the notice-printing code knows how far back to look.
  if (!_.contains(_.pluck(notices, 'release'), blessedReleaseName)) {
    die("notices.json must contain release " +
        blessedReleaseName + "! (It does not need to have notices.)");
  }

  _.each(notices, function (record) {
    if (!record.release)
      die("An element of notices.json lacks a release.");
    _.each(record.notices, function (line) {
      if (line.length + record.release.length + 2 > 80) {
        die("notices.json: notice line too long: " + line);
      }
    });
  });

  var bannerFilename = path.resolve(__dirname, 'banner.txt');
  var banner = doOrDie("Can't read banner file " + bannerFilename, function () {
    return fs.readFileSync(bannerFilename, 'utf8');
  });

  console.log("Blessing RC '%s' as '%s'", rcName, blessedReleaseName);

  // Print the banner first, so we can kill if we forgot to update it.
  console.log("Here's the banner users will see that tells them to upgrade:");
  console.log(banner);

  resetDistDirectory(blessedReleaseName, rcManifest, notices);
  _.each(PLATFORMS, function (platform) {
    makeWarehouseStructure(blessedReleaseName, rcManifest, notices);
    downloadPackages(rcManifest.packages, platform);
    downloadTools(rcManifest.tools, platform);
    makeBootstrapTarball(platform);
  });
  writeGlobalManifest(blessedReleaseName, banner);

  writeBigRedButton(blessedReleaseName, gitTagSourceSha, gitTag);
};

Fiber(main).run();
