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
var warehouse = require('../../tools/warehouse.js');

var PLATFORMS = [
  'Darwin-x86_64',
  'Linux-i686',
  'Linux-x86_64'
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
  return files.getUrl({
    url: "https://s3.amazonaws.com/com.meteor.warehouse/" + path,
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
  fs.writeFileSync(path, JSON.stringify(jsonObject, null, 2));
  // In 0.10 we can pass a mode to writeFileSync, but not yet...
  fs.chmodSync(path, 0444);
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
  warehouseDirectory = path.join(distDirectory, '.meteor');
  files.mkdir_p(path.join(warehouseDirectory, 'releases'), 0755);
  fs.mkdirSync(path.join(warehouseDirectory, 'packages'), 0755);
  fs.mkdirSync(path.join(warehouseDirectory, 'tools'), 0755);
  fs.symlinkSync('tools/latest/bin/meteor',
                 path.join(warehouseDirectory, 'meteor'));
  fs.symlinkSync(blessedReleaseName + '.release.json',
                 path.join(warehouseDirectory, 'releases', 'latest'));
  fs.symlinkSync(rcManifest.tools,
                 path.join(warehouseDirectory, 'tools', 'latest'));
  // Write release JSON files both to inside the bootstrap tarball and outside
  // (to be uploaded separately).
  writeJSONFile(path.join(warehouseDirectory, 'releases',
                          blessedReleaseName + '.release.json'),
                rcManifest);
  writeJSONFile(path.join(distDirectory, blessedReleaseName + '.release.json'),
                rcManifest);
  writeJSONFile(path.join(warehouseDirectory, 'releases',
                          blessedReleaseName + '.notices.json'),
                notices);
  writeJSONFile(path.join(distDirectory, blessedReleaseName + '.notices.json'),
                notices);
};

var downloadPackages = function (rcManifest) {
  console.log("Downloading packages");
  warehouse.downloadPackagesToWarehouse(
    rcManifest.packages, warehouseDirectory);
};

var bootstrapTarballFilename = function (platform) {
  return "meteor-bootstrap-" + platform + ".tar.gz";
}

var makeBootstrapTarball = function (toolsVersion, platform) {
  console.log("Downloading tools for " + platform);
  warehouse.downloadToolsToWarehouse(
    toolsVersion, platform, warehouseDirectory);
  console.log("Creating bootstrap tarball for " + platform);
  var tarballName = bootstrapTarballFilename(platform);
  files.createTarball(warehouseDirectory,
                      path.join(distDirectory, tarballName));
  // Clean up for the next platform.
  files.rm_recursive(path.join(warehouseDirectory, 'tools', toolsVersion));
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
    // XXX update to 0.6.0 when we're ready to release, then NEVER CHANGE AGAIN.
    version: "0.5.9",
    deb_version: "0.5.9-1",
    rpm_version: "0.5.9-1",
    urlbase: "https://d3sqy0vbqsdhku.cloudfront.net"
  };

  writeJSONFile(path.join(distDirectory, 'manifest.json'), globalManifest);
};


var writeBigRedButton = function (blessedReleaseName, gitTagSourceSha, gitTag) {
  var s3Files = _.map(PLATFORMS, function (platform) {
    return [bootstrapTarballFilename(platform),
            'com.meteor.warehouse/bootstrap/' + blessedReleaseName];
  });
  s3Files.push([blessedReleaseName + '.notices.json',
                'com.meteor.warehouse/releases']);
  s3Files.push([blessedReleaseName + '.release.json',
                'com.meteor.warehouse/releases']);
  s3Files.push(['manifest.json', 'com.meteor.static/update']);
  var scriptText =
        "#!/bin/bash\n" +
        "# Wow! It's time to release Meteor " + blessedReleaseName + "!\n" +
        "# Look at the contents of this directory, cross your fingers, and\n" +
        "# run this script!\n\n" +
        "set -e\n" +
        "cd " + distDirectory + "\n" +
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

  var bannerFilename = path.resolve(__dirname, 'banner.txt');
  var banner = doOrDie("Can't read banner file " + bannerFilename, function () {
    return fs.readFileSync(bannerFilename, 'utf8');
  });

  console.log("Blessing RC '%s' as '%s'", rcName, blessedReleaseName);

  resetDistDirectory(blessedReleaseName, rcManifest, notices);
  downloadPackages(rcManifest);
  _.each(PLATFORMS, function (platform) {
    makeBootstrapTarball(rcManifest.tools, platform);
  });
  writeGlobalManifest(blessedReleaseName, banner);

  console.log("Here's the banner users will see that tells them to upgrade:");
  console.log(banner);

  writeBigRedButton(blessedReleaseName, gitTagSourceSha, gitTag);
};

Fiber(main).run();
