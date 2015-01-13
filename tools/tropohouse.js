var _ = require("underscore");
var files = require('./files.js');
var utils = require('./utils.js');
var httpHelpers = require('./http-helpers.js');
var archinfo = require('./archinfo.js');
var catalog = require('./catalog.js');
var Isopack = require('./isopack.js').Isopack;
var config = require('./config.js');
var buildmessage = require('./buildmessage.js');
var Console = require('./console.js').Console;

exports.Tropohouse = function (root) {
  var self = this;
  self.root = root;
};

// Return the directory containing our loaded collection of tools, releases and
// packages. If we're running an installed version, found at $HOME/.meteor, if
// we are running form a checkout, probably at $CHECKOUT_DIR/.meteor.
var defaultWarehouseDir = function () {
  // a hook for tests, or i guess for users.
  if (process.env.METEOR_WAREHOUSE_DIR)
    return process.env.METEOR_WAREHOUSE_DIR;

  var warehouseBase = files.inCheckout()
     ? files.getCurrentToolsDir() : process.env.HOME;
  // XXX This will be `.meteor` soon, once we've written the code to make the
  // tropohouse and warehouse live together in harmony (eg, allowing tropohouse
  // tools to springboard to warehouse tools).
  return files.pathJoin(warehouseBase, ".meteor");
};

// The default tropohouse is on disk at defaultWarehouseDir(); you can make your
// own Tropohouse to override these things.
exports.default = new exports.Tropohouse(defaultWarehouseDir());

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
      utils.escapePackageNameForPath(packageName),
      version);

    return relative ? relativePath : files.pathJoin(self.root, relativePath);
  },

  // Pretty extreme! We call this when we learn that something has changed on
  // the server in a way that our sync protocol doesn't understand well.
  wipeAllPackages: function () {
    var self = this;

    var packagesDirectoryName = config.getPackagesDirectoryName();

    var packageRootDir = files.pathJoin(self.root, packagesDirectoryName);
    try {
      // XXX this variable actually can't be accessed from outside this
      // line, this is definitely a bug
      var escapedPackages = files.readdir(packageRootDir);
    } catch (e) {
      // No packages at all? We're done.
      if (e.code === 'ENOENT')
        return;
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
      var toolsDir = files.getCurrentToolsDir();
      // eg, 'meteor-tool'
      currentToolPackageEscaped =
        files.pathBasename(files.pathDirname(files.pathDirname(toolsDir)));
      // eg, '.1.0.17-xyz1.2.ut200e++os.osx.x86_64+web.browser+web.cordova'
      var toolVersionDir = files.pathBasename(files.pathDirname(toolsDir));
      var toolVersionWithDotAndRandomBit = toolVersionDir.split('++')[0];
      var pieces = toolVersionWithDotAndRandomBit.split('.');
      pieces.shift();
      pieces.pop();
      currentToolVersion = pieces.join('.');
      var latestMeteorSymlink = self.latestMeteorSymlink();
      if (utils.startsWith(latestMeteorSymlink,
                           packagesDirectoryName + files.pathSep)) {
        var rest = latestMeteorSymlink.substr(
          packagesDirectoryName.length + files.pathSep.length);

        var pieces = rest.split(files.pathSep);
        latestToolPackageEscaped = pieces[0];
        latestToolVersion = pieces[1];
      }
    }

    _.each(escapedPackages, function (packageEscaped) {
      var packageDir = files.pathJoin(packageRootDir, packageEscaped);
      try {
        var versions = files.readdir(packageDir);
      } catch (e) {
        // Somebody put a file in here or something? Whatever, ignore.
        if (e.code === 'ENOENT' || e.code === 'ENOTDIR')
          return;
        throw e;
      }
      _.each(versions, function (version) {
        // Is this a pre-0.9.0 "warehouse" version with a hash name?
        if (/^[a-f0-9]{3,}$/.test(version))
          return;

        // Skip the currently-latest tool (ie, don't break top-level meteor
        // symlink). This includes both the symlink with its name and the thing
        // it points to.
        if (packageEscaped === latestToolPackageEscaped &&
            (version === latestToolVersion ||
             utils.startsWith(version, '.' + latestToolVersion + '.'))) {
          return;
        }

        // Skip the currently-executing tool (ie, don't break the current
        // operation).
        if (packageEscaped === currentToolPackageEscaped &&
            (version === currentToolVersion ||
             utils.startsWith(version, '.' + currentToolVersion + '.'))) {
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
    if (!options.packageName)
      throw Error("Missing required argument: packageName");
    if (!options.version)
      throw Error("Missing required argument: version");
    var architectures = options.architectures || [archinfo.host()];

    var downloaded = self._alreadyDownloaded({
      packageName: options.packageName,
      version: options.version
    });

    return _.every(architectures, function (requiredArch) {
      return archinfo.mostSpecificMatch(requiredArch, downloaded.arches);
    });
  },
  // Contacts the package server, downloads and extracts a tarball for a given
  // buildRecord into a temporary directory, whose path is returned.
  //
  // XXX: Error handling.
  _downloadBuildToTempDir: function (versionInfo, buildRecord) {
    var self = this;
    var targetDirectory = files.mkdtemp();

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
    files.extractTarGz(packageTarball, targetDirectory);

    return targetDirectory;
  },

  // Given a package name and version, returns a survey of what we have
  // downloaded for this package at this version. Specifically, returns an
  // object with the following keys:
  //  - arches: the architectures for which we have downloaded this package
  //  - target: the target of the symlink at which we store this package
  //
  // Throws if the symlink cannot be read for any reason other than ENOENT/
  _alreadyDownloaded: function (options) {
    var self = this;
    var packageName = options.packageName;
    var version = options.version;
    if (!options.packageName)
      throw Error("Missing required argument: packageName");
    if (!options.version)
      throw Error("Missing required argument: version");


    // Figure out what arches (if any) we have loaded for this package version
    // already.
    var packageLinkFile = self.packagePath(packageName, version);
    var downloadedArches = [];
    var packageLinkTarget = null;
    try {
      packageLinkTarget = files.readlink(packageLinkFile);
    } catch (e) {
      // Complain about anything other than "we don't have it at all". This
      // includes "not a symlink": The main reason this would not be a symlink
      // is if it's a directory containing a pre-0.9.0 package (ie, this is a
      // warehouse package not a tropohouse package). But the versions should
      // not overlap: warehouse versions are truncated SHAs whereas tropohouse
      // versions should be semver-like.
      if (e.code !== 'ENOENT')
        throw e;
    }
    if (packageLinkTarget) {
      // The symlink will be of the form '.VERSION.RANDOMTOKEN++web.browser+os',
      // so this strips off the part before the '++'.
      // XXX maybe we should just read the isopack.json instead of
      //     depending on the symlink?
      var archPart = packageLinkTarget.split('++')[1];
      if (!archPart)
        throw Error("unexpected symlink target for " + packageName + "@" +
                    version + ": " + packageLinkTarget);
      downloadedArches = archPart.split('+');
    }
    return { arches: downloadedArches, target: packageLinkTarget };
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

    if (!options.packageName)
      throw Error("Missing required argument: packageName");
    if (!options.version)
      throw Error("Missing required argument: version");
    if (!options.architectures)
      throw Error("Missing required argument: architectures");

    var packageName = options.packageName;
    var version = options.version;

    // Look up the information that we have already downloaded.
    var downloaded = self._alreadyDownloaded({
      packageName: packageName,
      version: version
    });
    var downloadedArches = downloaded.arches;
    var packageLinkTarget = downloaded.target;

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
        "No compatible build found", {tags: { refreshCouldHelp: true }});
      return null;
    }

    var packageLinkFile = self.packagePath(packageName, version);
    var download = function download () {
      buildmessage.assertInCapture();

      Console.debug("Downloading missing local versions of package",
                    packageName + "@" + version, ":", archesToDownload);

      buildmessage.enterJob({
        title: "downloading " + packageName + "@" + version + "..."
      }, function() {
        var buildTempDirs = [];
        // If there's already a package in the tropohouse, start with it.
        if (packageLinkTarget) {
          buildTempDirs.push(
            files.pathResolve(files.pathDirname(packageLinkFile),
                              packageLinkTarget));
        }
        // XXX how does concurrency work here?  we could just get errors if we
        // try to rename over the other thing?  but that's the same as in
        // warehouse?
        _.each(buildsToDownload, function (build) {
          try {
            buildTempDirs.push(self._downloadBuildToTempDir(
              { packageName: packageName, version: version }, build));
          } catch (e) {
            if (!(e instanceof files.OfflineError))
              throw e;
            buildmessage.error(e.error.message);
          }
        });
        if (buildmessage.jobHasMessages())
          return;

        // We need to turn our builds into a single isopack.
        var isopack = new Isopack;
        _.each(buildTempDirs, function (buildTempDir, i) {
          isopack._loadUnibuildsFromPath(
            packageName,
            buildTempDir,
            {firstIsopack: i === 0});
        });
        // Note: wipeAllPackages depends on this filename structure, as does the
        // part above which readlinks.
        var newPackageLinkTarget = '.' + version + '.'
              + utils.randomToken() + '++' + isopack.buildArchitectures();
        var combinedDirectory = self.packagePath(
          packageName, newPackageLinkTarget);
        isopack.saveToPath(combinedDirectory);
        files.symlinkOverSync(newPackageLinkTarget, packageLinkFile);

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

    var downloaders = [];
    packageMap.eachPackage(function (packageName, info) {
      if (info.kind !== 'versioned')
        return;
      buildmessage.enterJob(
        "checking for " + packageName + "@" + info.version,
        function () {
          var downloader = self._makeDownloader({
            packageName: packageName,
            version: info.version,
            architectures: serverArchs
          });
          if (buildmessage.jobHasMessages()) {
            downloaders = null;
            return;
          }
          if (downloader && downloaders)
            downloaders.push(downloader);
        }
      );
    });

    // Did anything fail? Don't download anything.
    if (! downloaders)
      return;

    // Nothing to download? Great.
    if (! downloaders.length)
      return;

    // Just one package to download? Use a good message.
    if (downloaders.length === 1) {
      var downloader = downloaders[0];
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
    return files.readlink(linkPath);
  },

  replaceLatestMeteorSymlink: function (linkText) {
    var self = this;
    var linkPath = files.pathJoin(self.root, 'meteor');
    files.symlinkOverSync(linkText, linkPath);
  }
});
