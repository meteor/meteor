var _ = require("underscore");
var files = require('../fs/files.js');
var utils = require('../utils/utils.js');
var httpHelpers = require('../utils/http-helpers.js');
var archinfo = require('../utils/archinfo.js');
var catalog = require('./catalog/catalog.js');
var Isopack = require('../isobuild/isopack.js').Isopack;
var config = require('../meteor-services/config.js');
var buildmessage = require('../utils/buildmessage.js');
var Console = require('../console/console.js').Console;
var colonConverter = require('../utils/colon-converter.js');

exports.Tropohouse = function (root, options) {
  var self = this;
  options = options || {};

  self.root = root;
  self.platform = options.platform || process.platform;
};

// Return the directory containing our loaded collection of tools, releases and
// packages. If we're running an installed version, found at $HOME/.meteor, if
// we are running form a checkout, probably at $CHECKOUT_DIR/.meteor.
var defaultWarehouseDir = function () {
  // a hook for tests, or i guess for users.
  if (process.env.METEOR_WAREHOUSE_DIR) {
    return process.env.METEOR_WAREHOUSE_DIR;
  }

  var warehouseBase = files.inCheckout()
     ? files.getCurrentToolsDir() : files.getHomeDir();
  // XXX This will be `.meteor` soon, once we've written the code to make the
  // tropohouse and warehouse live together in harmony (eg, allowing tropohouse
  // tools to springboard to warehouse tools).
  return files.pathJoin(warehouseBase, ".meteor");
};

// The default tropohouse is on disk at defaultWarehouseDir(); you can make your
// own Tropohouse to override these things.
exports.default = new exports.Tropohouse(defaultWarehouseDir());

/**
 * Extract a package tarball, and on Windows convert file paths and metadata
 * @param  {String} packageTarball path to tarball
 * @param {Boolean} forceConvert Convert paths even on unix, for testing
 * @return {String}                Temporary directory with contents of package
 */
exports._extractAndConvert = function (packageTarball, forceConvert) {
  var targetDirectory = files.mkdtemp();
  files.extractTarGz(packageTarball, targetDirectory, {
    forceConvert: forceConvert
  });

  if (process.platform === "win32" || forceConvert) {
    // Packages published before the Windows release might have colons or
    // other unsavory characters in path names. In hopes of making most of
    // these packages work on Windows, we will try to automatically convert
    // them.
    //
    // At this location in the code, the metadata inside the isopack is
    // inconsistent with the actual file paths, since we convert some file
    // paths inside extractTarGz. Now we need to convert the metadata to match
    // the files.

    // Step 1. Load the metadata from isopack.json and convert colons in the
    // file paths. We have already converted the colons in the actual files
    // while untarring.
    var {metadata, originalVersion} =
          Isopack.readMetadataFromDirectory(targetDirectory);

    // By the time that isopack-2 came out (around Meteor 1.2) nobody should be
    // making colon packages anyway, so let's not waste effort converting (and
    // moreover, not bother to make sure the code below works for isopack-2).
    if (originalVersion === 'unipackage-pre2' ||
        originalVersion === 'isopack-1') {
      var convertedMetadata = colonConverter.convertIsopack(metadata);

      // Step 2. Write the isopack.json file.  Keep it as isopack-1;
      // _saveIsopack later will upgrade to isopack-2.
      var isopackFileData = {};
      isopackFileData['isopack-1'] = convertedMetadata;

      var isopackJsonPath = files.pathJoin(targetDirectory, "isopack.json");

      if (files.exists(isopackJsonPath)) {
        files.chmod(isopackJsonPath, 0o777);
      }

      files.writeFile(
        isopackJsonPath,
        new Buffer(JSON.stringify(isopackFileData, null, 2), 'utf8'),
        {mode: 0o444});

      // Step 3. Clean up old unipackage.json file if it exists
      files.unlink(files.pathJoin(targetDirectory, "unipackage.json"));

      // Result: Now we are in a state where the isopack.json file paths are
      // consistent with the paths in the downloaded tarball.

      // Now, we have to convert the unibuild files in the same way.
      _.each(convertedMetadata.builds, function (unibuildMeta) {
        var unibuildJsonPath = files.pathJoin(targetDirectory,
                                              unibuildMeta.path);
        var unibuildJson = JSON.parse(files.readFile(unibuildJsonPath));

        if (unibuildJson.format !== "unipackage-unibuild-pre1") {
          throw new Error("Unsupported isopack unibuild format: " +
                          JSON.stringify(unibuildJson.format));
        }

        var convertedUnibuild = colonConverter.convertUnibuild(unibuildJson);

        files.chmod(unibuildJsonPath, 0o777);
        files.writeFile(
          unibuildJsonPath,
          new Buffer(JSON.stringify(convertedUnibuild, null, 2), 'utf8'),
          {mode: 0o444});
        // Result: Now we are in a state where the unibuild file paths are
        // consistent with the paths in the downloaded tarball.
      });

      // Lastly, convert the build plugins, which are in the JSImage format
      _.each(convertedMetadata.plugins, function (pluginMeta) {
        var programJsonPath = files.pathJoin(targetDirectory, pluginMeta.path);
        var programJson = JSON.parse(files.readFile(programJsonPath));

        if (programJson.format !== "javascript-image-pre1") {
          throw new Error("Unsupported plugin format: " +
                          JSON.stringify(programJson.format));
        }

        var convertedPlugin = colonConverter.convertJSImage(programJson);

        files.chmod(programJsonPath, 0o777);
        files.writeFile(
          programJsonPath,
          new Buffer(JSON.stringify(convertedPlugin, null, 2), 'utf8'),
          {mode: 0o444});
        // Result: Now we are in a state where the build plugin file paths are
        // consistent with the paths in the downloaded tarball.
      });
    }
  }

  return targetDirectory;
};

_.extend(exports.Tropohouse.prototype, {
  // Returns the load path where one can expect to find the package, at a given
  // version, if we have already downloaded from the package server. Does not
  // check for contents.
  //
  // Returns null if the package name is lexographically invalid.
  packagePath: function (packageName, version, relative) {
    var self = this;
    if (! utils.isValidPackageName(packageName)) {
      return null;
    }

    var relativePath = files.pathJoin(
      config.getPackagesDirectoryName(),
      colonConverter.convert(packageName),
      version);

    return relative ? relativePath : files.pathJoin(self.root, relativePath);
  },

  // Pretty extreme! We call this when we learn that something has changed on
  // the server in a way that our sync protocol doesn't understand well.
  wipeAllPackages: function () {
    var self = this;
    var packagesDirectoryName = config.getPackagesDirectoryName();
    var packageRootDir = files.pathJoin(self.root, packagesDirectoryName);
    var escapedPackages;

    try {
      // XXX this variable actually can't be accessed from outside this
      // line, this is definitely a bug
      escapedPackages = files.readdir(packageRootDir);
    } catch (e) {
      // No packages at all? We're done.
      if (e.code === 'ENOENT') {
        return;
      }
      throw e;
    }

    // We want to be careful not to break the 'meteor' symlink inside the
    // tropohouse. Hopefully nobody deleted/modified that package!
    var latestToolPackageEscaped = null;
    var latestToolVersion = null;
    var currentToolPackageEscaped = null;
    var currentToolVersion = null;
    // Warning: we can't examine release.current here, because we might be
    // currently processing release.load!
    if (!files.inCheckout()) {
      // toolsDir is something like:
      // /home/user/.meteor/packages/meteor-tool/.1.0.17.ut200e++os.osx.x86_64+web.browser+web.cordova/meteor-tool-os.osx.x86_64
      // or /C/Users/user/AppData/Local/Temp/mt-17618kk/tropohouse/packages/meteor-tool/33.0.1/mt-os.windows.x86_32 on Windows
      var toolsDir = files.getCurrentToolsDir();
      // eg, 'meteor-tool'
      currentToolPackageEscaped =
        files.pathBasename(files.pathDirname(files.pathDirname(toolsDir)));
      // eg, '.1.0.17-xyz1.2.ut200e++os.osx.x86_64+web.browser+web.cordova' on Unix
      // or '33.0.1' on Windows
      var toolVersionDir = files.pathBasename(files.pathDirname(toolsDir));

      if (process.platform !== 'win32') {
        var toolVersionWithDotAndRandomBit = toolVersionDir.split('++')[0];
        var pieces = toolVersionWithDotAndRandomBit.split('.');
        pieces.shift();
        pieces.pop();
        currentToolVersion = pieces.join('.');
      } else {
        currentToolVersion = toolVersionDir;
      }

      var latestMeteorSymlink = self.latestMeteorSymlink();
      if (latestMeteorSymlink.startsWith(packagesDirectoryName +
                                         files.pathSep)) {
        var rest = latestMeteorSymlink.substr(
          packagesDirectoryName.length + files.pathSep.length);

        pieces = rest.split(files.pathSep);
        latestToolPackageEscaped = pieces[0];
        latestToolVersion = pieces[1];
      }
    }

    _.each(escapedPackages, function (packageEscaped) {
      var packageDir = files.pathJoin(packageRootDir, packageEscaped);
      var versions;

      try {
        versions = files.readdir(packageDir);
      } catch (e) {
        // Somebody put a file in here or something? Whatever, ignore.
        if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
          return;
        }
        throw e;
      }
      _.each(versions, function (version) {
        // Is this a pre-0.9.0 "warehouse" version with a hash name?
        if (/^[a-f0-9]{3,}$/.test(version)) {
          return;
        }

        // Skip the currently-latest tool (ie, don't break top-level meteor
        // symlink). This includes both the symlink with its name and the thing
        // it points to.
        if (packageEscaped === latestToolPackageEscaped &&
            (version === latestToolVersion ||
             version.startsWith('.' + latestToolVersion + '.'))) {
          return;
        }

        // Skip the currently-executing tool (ie, don't break the current
        // operation).
        if (packageEscaped === currentToolPackageEscaped &&
            (version === currentToolVersion ||
             version.startsWith('.' + currentToolVersion + '.'))) {
          return;
        }

        files.rm_recursive(files.pathJoin(packageDir, version));
      });
    });
  },
  // Returns true if the given package at the given version exists on disk, or
  // false otherwise. Takes in the following:
  //  - packageName: name of the package
  //  - version: version
  //  - architectures: (optional) array of architectures. Defaults to
  //    archinfo.host().
  installed: function (options) {
    var self = this;
    if (!options.packageName) {
      throw Error("Missing required argument: packageName");
    }
    if (!options.version) {
      throw Error("Missing required argument: version");
    }
    var architectures = options.architectures || [archinfo.host()];

    var downloaded = self._alreadyDownloaded({
      packageName: options.packageName,
      version: options.version
    });

    return _.every(architectures, function (requiredArch) {
      return archinfo.mostSpecificMatch(requiredArch, downloaded);
    });
  },

  // Contacts the package server, downloads and extracts a tarball for a given
  // buildRecord into a temporary directory, whose path is returned.
  //
  // XXX: Error handling.
  _downloadBuildToTempDir: function (versionInfo, buildRecord) {
    var url = buildRecord.build.url;

    // XXX: We use one progress for download & untar; this isn't ideal:
    // it relies on extractTarGz being fast and not reporting any progress.
    // Really, we should create two subtasks
    // (and, we should stream the download to the tar extractor)
    var packageTarball = httpHelpers.getUrl({
      url: url,
      encoding: null,
      progress: buildmessage.getCurrentProgressTracker(),
      wait: false
    });

    return exports._extractAndConvert(packageTarball);
  },

  // Given a package name and version, returns the architectures for
  // which we have downloaded this package
  //
  // Throws if the symlink cannot be read for any reason other than
  // ENOENT/
  _alreadyDownloaded: function (options) {
    var self = this;
    var packageName = options.packageName;
    var version = options.version;
    if (!options.packageName) {
      throw Error("Missing required argument: packageName");
    }
    if (!options.version) {
      throw Error("Missing required argument: version");
    }


    // Figure out what arches (if any) we have loaded for this package version
    // already.
    var packagePath = self.packagePath(packageName, version);
    var downloadedArches = [];

    // Find out which arches we have by reading the isopack metadata
    var {metadata: packageMetadata} =
          Isopack.readMetadataFromDirectory(packagePath);

    // packageMetadata is null if there is no package at packagePath
    if (packageMetadata) {
      downloadedArches = _.pluck(packageMetadata.builds, "arch");
    }

    return downloadedArches;
  },

  _saveIsopack: function (isopack, packageName) {
    // XXX does this actually need the name as an argument or can we just get
    // it from isopack?

    var self = this;

    if (self.platform === "win32") {
      isopack.saveToPath(self.packagePath(packageName, isopack.version), {
        includePreCompilerPluginIsopackVersions: true
      });
    } else {
      // Note: wipeAllPackages depends on this filename structure
      // On Mac and Linux, we used to use a filename structure that used the
      // names of symlinks to determine which builds we have downloaded. We no
      // longer need this because we now parse package metadata, but we still
      // need to write the symlinks correctly so that old meteor tools can
      // still read newly downloaded packages.
      var newPackageLinkTarget = '.' + isopack.version + '.' +
        utils.randomToken() + '++' + isopack.buildArchitectures();

      var combinedDirectory = self.packagePath(
        packageName, newPackageLinkTarget);

      isopack.saveToPath(combinedDirectory, {
        includePreCompilerPluginIsopackVersions: true
      });

      files.symlinkOverSync(newPackageLinkTarget,
        self.packagePath(packageName, isopack.version));
    }
  },

  // Given a package name, version, and required architectures, checks to make
  // sure that we have the package downloaded at the requested arch. If we do,
  // returns null.
  //
  // Otherwise, if the catalog has no information about appropriate builds,
  // registers a buildmessage error and returns null.
  //
  // Otherwise, returns a 'downloader' object with keys packageName, version,
  // and download; download is a method which should be called in a buildmessage
  // capture which actually downloads the package (registering any errors with
  // buildmessage).
  _makeDownloader: function (options) {
    var self = this;
    buildmessage.assertInJob();

    if (!options.packageName) {
      throw Error("Missing required argument: packageName");
    }
    if (!options.version) {
      throw Error("Missing required argument: version");
    }
    if (!options.architectures) {
      throw Error("Missing required argument: architectures");
    }

    var packageName = options.packageName;
    var version = options.version;

    // Look up which arches we have already downloaded
    var downloadedArches = self._alreadyDownloaded({
      packageName: packageName,
      version: version
    });

    var archesToDownload = _.filter(options.architectures, function (requiredArch) {
      return !archinfo.mostSpecificMatch(requiredArch, downloadedArches);
    });

    // Have everything we need? Great.
    if (!archesToDownload.length) {
      Console.debug("Local package version is up-to-date:", packageName + "@" + version);
      return null;
    }

    // Since we are downloading from the server (and we've already done the
    // local package check), we can use the official catalog here. (This is
    // important, since springboarding calls this function before the complete
    // catalog is ready!)
    var buildsToDownload = catalog.official.getBuildsForArches(
      packageName, version, archesToDownload);
    if (! buildsToDownload) {
      buildmessage.error(
        "No compatible binary build found for this package. " +
        "Contact the package author and ask them to publish it " +
        "for your platform.", {tags: { refreshCouldHelp: true }});
      return null;
    }

    var packagePath = self.packagePath(packageName, version);
    var download = function download () {
      buildmessage.assertInCapture();

      Console.debug("Downloading missing local versions of package",
                    packageName + "@" + version, ":", archesToDownload);

      buildmessage.enterJob({
        title: "downloading " + packageName + "@" + version + "..."
      }, function() {
        var buildInputDirs = [];
        var buildTempDirs = [];
        var packageLinkTarget = null;

        // Find the previous actual directory of the package
        if (self.platform === "win32") {
          // On Windows, we don't use symlinks.
          // If there's already a package in the tropohouse, start with it.
          if (files.exists(packagePath)) {
            buildInputDirs.push(packagePath);
          }
        } else {
          // On posix, we have a symlink structure. Get the target of the
          // symlink so that we can delete it later.
          try {
            packageLinkTarget = files.readlink(packagePath);
          } catch (e) {
            // Complain about anything other than "we don't have it at all".
            // This includes "not a symlink": The main reason this would not be
            // a symlink is if it's a directory containing a pre-0.9.0 package
            // (ie, this is a warehouse package not a tropohouse package). But
            // the versions should not overlap: warehouse versions are truncated
            // SHAs whereas tropohouse versions should be semver-like.
            if (e.code !== 'ENOENT') {
              throw e;
            }
          }

          // If there's already a package in the tropohouse, start with it.
          if (packageLinkTarget) {
            buildInputDirs.push(
              files.pathResolve(files.pathDirname(packagePath),
                                packageLinkTarget));
          }
        }

        // XXX how does concurrency work here?  we could just get errors if we
        // try to rename over the other thing?  but that's the same as in
        // warehouse?
        _.each(buildsToDownload, function (build) {
          buildmessage.enterJob({
            title: "downloading " + packageName + "@" + version + "..."
          }, function() {
            try {
              var buildTempDir = self._downloadBuildToTempDir(
                { packageName: packageName, version: version }, build);
            } catch (e) {
              if (!(e instanceof files.OfflineError)) {
                throw e;
              }
              buildmessage.error(e.error.message);
            }
            buildInputDirs.push(buildTempDir);
            buildTempDirs.push(buildTempDir);
          });
        });
        if (buildmessage.jobHasMessages()) {
          return;
        }

        // We need to turn our builds into a single isopack.
        var isopack = new Isopack();
        _.each(buildInputDirs, function (buildTempDir, i) {
          isopack._loadUnibuildsFromPath(
            packageName,
            buildTempDir,
            {firstIsopack: i === 0});
        });

        self._saveIsopack(isopack, packageName, version);

        // Delete temp directories now (asynchronously).
        _.each(buildTempDirs, function (buildTempDir) {
          files.freeTempDir(buildTempDir);
        });

        // Clean up old version.
        if (packageLinkTarget) {
          files.rm_recursive(self.packagePath(packageName, packageLinkTarget));
        }
      });
    };

    return {
      packageName: packageName,
      version: version,
      download: download
    };
  },


  // Takes in a PackageMap object. Downloads any versioned packages we don't
  // already have.
  //
  // Reports errors via buildmessage.
  downloadPackagesMissingFromMap: function (packageMap, options) {
    var self = this;
    buildmessage.assertInCapture();
    options = options || {};
    var serverArchs = options.serverArchitectures || [archinfo.host()];

    var downloader;
    var downloaders = [];
    packageMap.eachPackage(function (packageName, info) {
      if (info.kind !== 'versioned') {
        return;
      }
      buildmessage.enterJob(
        "checking for " + packageName + "@" + info.version,
        function () {
          downloader = self._makeDownloader({
            packageName: packageName,
            version: info.version,
            architectures: serverArchs
          });
          if (buildmessage.jobHasMessages()) {
            downloaders = null;
            return;
          }
          if (downloader && downloaders) {
            downloaders.push(downloader);
          }
        }
      );
    });

    // Did anything fail? Don't download anything.
    if (! downloaders) {
      return;
    }

    // Nothing to download? Great.
    if (! downloaders.length) {
      return;
    }

    // Just one package to download? Use a good message.
    if (downloaders.length === 1) {
      downloader = downloaders[0];
      buildmessage.enterJob(
        "downloading " + downloader.packageName + "@" + downloader.version,
        function () {
          downloader.download();
        }
      );
      return;
    }

    // Download multiple packages in parallel.
    // XXX use a better progress bar that shows how many you've
    // finished downloading.
    buildmessage.forkJoin({
      title: 'downloading ' + downloaders.length + ' packages',
      parallel: true
    }, downloaders, function (downloader) {
      downloader.download();
    });
  },

  latestMeteorSymlink: function () {
    var self = this;
    var linkPath = files.pathJoin(self.root, 'meteor');
    return files.readLinkToMeteorScript(linkPath, self.platform);
  },

  linkToLatestMeteor: function (scriptLocation) {
    var self = this;
    var linkPath = files.pathJoin(self.root, 'meteor');
    files.linkToMeteorScript(scriptLocation, linkPath, self.platform);
  },

  _getPlatform: function () {
    return this.platform;
  }
});
