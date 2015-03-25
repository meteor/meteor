var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require("../files.js");
var utils = require("../utils.js");
var archinfo = require("../archinfo.js");
var _ = require('underscore');

selftest.define("wipe all packages", function () {
  var s = new Sandbox({
    warehouse: {
      v1: { tool: "meteor-tool@33.0.1", recommended: true },
      v2: { tool: "meteor-tool@33.0.2", recommended: true },
      v3: { tool: "meteor-tool@33.0.3", recommended: true }
    }
  });
  var meteorToolVersion = function (v) {
    return {
      _id: 'VID' + v.replace(/\./g, ''),
      packageName: 'meteor-tool',
      testName: null,
      version: v,
      publishedBy: null,
      description: 'The Meteor command-line tool',
      git: undefined,
      dependencies: { meteor: { constraint: null, references: [{ arch: 'os' }, { arch: 'web.browser' }, { arch: 'web.cordova' }] } },
      source: null,
      lastUpdated: null,
      published: null,
      isTest: false,
      debugOnly: false,
      containsPlugins: false
    };
  };
  var meteorToolBuild = function (v) {
    return {
      buildArchitectures: archinfo.host(),
      versionId: 'VID' + v.replace(/\./g, ''),
      _id: utils.randomToken()
    };
  };

  // insert the new tool versions into the catalog
  s.warehouseOfficialCatalog.insertData({
    syncToken: {},
    formatVersion: "1.0",
    collections: {
      packages: [],
      versions: [meteorToolVersion('33.0.1'), meteorToolVersion('33.0.2'), meteorToolVersion('33.0.3')],
      builds: [meteorToolBuild('33.0.1'), meteorToolBuild('33.0.2'), meteorToolBuild('33.0.3')],
      releaseTracks: [],
      releaseVersions: []
    }
  });

  // help warehouse faking by copying the meteor-tool 3 times and introducing 3
  // fake versions (identical in code to the one we are running)
  var latestMeteorToolVersion =
    files.readLinkToMeteorScript(files.pathJoin(s.warehouse, 'meteor')).split('/');
  latestMeteorToolVersion = latestMeteorToolVersion[latestMeteorToolVersion.length - 3];

  var prefix = files.pathJoin(s.warehouse, 'packages', 'meteor-tool');
  var copyTool = function (srcVersion, dstVersion) {
    if (process.platform === 'win32') {
      // just copy the files
      files.cp_r(
        files.pathJoin(prefix, srcVersion),
        files.pathJoin(prefix, dstVersion), {
          preserveSymlinks: true
        });
    } else {
      // figure out what the symlink links to and copy the folder *and* the
      // symlink
      var srcFullVersion = files.readlink(files.pathJoin(prefix, srcVersion));
      var dstFullVersion = srcFullVersion.replace(srcVersion, dstVersion);

      // copy the hidden folder
      files.cp_r(
        files.pathJoin(prefix, srcFullVersion),
        files.pathJoin(prefix, dstFullVersion), {
          preserveSymlinks: true
        });

      // link to it
      files.symlink(
        dstFullVersion,
        files.pathJoin(prefix, dstVersion));
    }

    var replaceVersionInFile = function (filename) {
      var filePath = files.pathJoin(prefix, dstVersion, filename);
      files.writeFile(
        filePath,
        files.readFile(filePath, 'utf8')
          .replace(new RegExp(srcVersion, 'g'), dstVersion));
    };

    // "fix" the isopack.json and unibuild.json files (they contain the versions)
    replaceVersionInFile('isopack.json');
    replaceVersionInFile('unipackage.json');
  };

  copyTool(latestMeteorToolVersion, '33.0.3');
  copyTool(latestMeteorToolVersion, '33.0.2');
  copyTool(latestMeteorToolVersion, '33.0.1');

  // since the warehouse faking system is weak and under-developed, add more
  // faking, such as making the v3 the latest version
  files.linkToMeteorScript(
    files.pathJoin('packages', 'meteor-tool', '33.0.3', 'mt-' + archinfo.host(), 'meteor'),
    files.pathJoin(s.warehouse, 'meteor'));


  var run;

  run = s.run('--release', 'v1', 'admin', 'wipe-all-packages');
  run.waitSecs(15);
  run.expectExit(0);

  // OK, wiped all packages, now let's go and check that everything is removed
  // except for the tool we are running right now and the latest tool. i.e. v1
  // and v3
  var notHidden = function (f) { return f[0] !== '.'; };
  var meteorToolDirs = _.filter(files.readdir(prefix), notHidden);
  selftest.expectTrue(meteorToolDirs.length === 2);
  _.each(meteorToolDirs, function (f) {
    var fPath = files.pathJoin(prefix, f);
    if (process.platform === 'win32') {
      // this is a dir
      selftest.expectTrue(files.lstat(fPath).isDirectory());
    } else {
      // this is a symlink to a dir and this dir exists
      selftest.expectTrue(files.lstat(fPath).isSymbolicLink());
      selftest.expectTrue(files.exists(files.pathJoin(prefix, files.readlink(fPath))));
    }

    // check that the version is either the running one, or the latest one
    selftest.expectTrue(_.contains(['33.0.1', '33.0.3'], f));
  });

  // Check that all other packages are wiped
  _.each(files.readdir(files.pathJoin(s.warehouse, 'packages')), function (p) {
    if (p[0] === '.') return;
    if (p === 'meteor-tool') return;
    var contents = files.readdir(files.pathJoin(s.warehouse, 'packages', p));
    contents = _.filter(contents, notHidden);
    selftest.expectTrue(contents.length === 0);
  });
});

