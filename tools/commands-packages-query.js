// These commands deal with aggregating local package data with the information
// contained in the Meteor Package Server. They also deal with presenting this
// to the user in various human or machine-readable ways.
var _ = require('underscore');
var archinfo = require('./archinfo.js');
var buildmessage = require('./buildmessage.js');
var catalog = require('./catalog.js');
var Console = require("./console.js").Console;
var files = require('./files.js');
var isopackets = require('./isopackets.js');
var main = require('./main.js');
var projectContextModule = require('./project-context.js');
var utils = require('./utils.js');

// We want these queries to be relatively fast, so we will only refresh the
// catalog if it is > 15 minutes old
var DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

// Maximum number of recent versions of a package or a release that we should
// return to the user, unless a more complete mode is requested.
var MAX_RECENT_VERSIONS = 5;

// XXX: Remove this if/when we do a Troposphere migration to backfill release
// version publication times.
// Estimate the publication date for a release. Since we have failed to keep
// track of publication times of release versions in the past, we will try to
// guess that the release was published at the same time as the tool.
var getReleaseVersionPublishedOn = function (versionRecord) {
  if (versionRecord.published) {
    return new Date(versionRecord.published);
  }
  // We don't know when the release was published. Luckily, since there is no
  // way to use the tool outside of a release, and we always change the tool
  // between releases, it is a good bet that the release was published on the
  // same day as the tool.
  var toolPackage = versionRecord.tool.split('@');
  var toolName = toolPackage[0];
  var toolVersion = toolPackage[1];
  var toolRecord = catalog.official.getVersion(toolName, toolVersion);
  return new Date(toolRecord.published);
};

// Convert package version dependencies into a more helpful format for output in
// 'meteor show'.
var formatDependencies = function (versionDependencies) {
  var dependencies = _.map(
    // The dependency on 'meteor' was almost certainly added automatically, by
    // Isobuild. Returning this to the user will only cause confusion.
    _.omit(versionDependencies, "meteor"),
    function (dep, depName) {
      // We will only consider this a weak dependency if all of its references
      // are marked as weak.
      var weak = _.every(dep.references, function (ref) {
        return !! ref.weak;
      });
      return {
        name: depName,
        constraint: dep.constraint,
        weak: weak
      };
  });
  return dependencies;
};

// Converts an object to an EJSON string with the right spacing.
var convertToEJSON = function (data) {
  var EJSON = isopackets.load('ejson').ejson.EJSON;
  return EJSON.stringify(data, { indent: true }) + "\n";
};

// Takes in a string and pads it with whitespace to the length of the longest
// possible date string.
var padLongformDate = function (dateStr) {
  var numSpaces = utils.maxDateLength - dateStr.length;
  return dateStr + Array(numSpaces + 1).join(' ');
};

// In order to get access to local package data, we need to create a local
// package catalog. The best way to do that is to create a temporary
// ProjectContext and let it handle catalog initialization. When we do, we need
// to make sure that it is aware of all the local packages that we might care
// about.
//
// This function returns such a ProjectContext, and takes in the following
// options:
//  - appDir: If we are running in the context of an app, this will contain the
//    root of the app. We want to make sure to grab the data from the app's
//    local packages.
//  - packageDir: If we are running in a package directory, this will contain
//    the source root of that package. If we are running from inside a package,
//    we want that package to show up in our results.
var getTempContext = function (options) {
  var projectContext;
  // If we are running in an app, we will use it to create a
  // (mostly immutable) projectContext.
  if (options.appDir) {
    projectContext = new projectContextModule.ProjectContext({
      projectDir: options.appDir,
      // Don't change the state of the app.
      neverWriteProjectConstraintsFile: true
    });
  } else {
    // We're not in an app, so we will create a temporary app and use it to load
    // the local catalog. If a local packageDir exists, include it manually.
    var currentPackageDir = options.packageDir ? [options.packageDir] : [];
    var tempProjectDir = files.mkdtemp('meteor-show');
    projectContext = new projectContextModule.ProjectContext({
      projectDir: tempProjectDir,
      explicitlyAddedLocalPackageDirs: currentPackageDir,
      neverWriteProjectConstraintsFile: true,
      neverWritePackageMap: true
    });
  }

  // It is possible that we can't process package.js files in our local packages
  // and have to exit early. This is unfortunate, but we can't search local
  // packages if we can't read them. If this turns out to be a frequent problem,
  // we can give a warning, instead of failing in the future. For now, we want
  // to err on the side of consistency.
  main.captureAndExit("=> Errors while reading local packages:", function () {
    projectContext.initializeCatalog();
  });
  return projectContext;
};

///////////////////////////////////////////////////////////////////////////////
// show
///////////////////////////////////////////////////////////////////////////////

// Print an error message if the user asks about an unknown item.
var itemNotFound = function (item) {
  Console.error(item + ": not found");
  utils.explainIfRefreshFailed();
  return 1;
};

// The two classes below collect and print relevant information about Meteor
// packages and Meteor releases, respectively. Specifically, they query the
// official catalog and, if applicable, relevant local sources. They also handle
// the details of printing their data to the screen.
//
// A query class has:
//  - data: an object representing the data it has collected in response to the
//  - query.
//  - a print method, that take options as an argument and prints the results to
//    the terminal.


// This class deals with information related to packages. To deal with local
// packages, it has to interact with the projectContext.
//
// The constructor takes in the following options:
//   - record: (mandatory) the meta-record for this package from the Packages
//   - collection.
//   - projectContext: (mandatory) a projectContext that we can use to look up
//     information on local packages.
//   - version: query for a specific version of this package.
//   - showOSArchitectures: collect and process data on OS
//     architectures that are available for different versions of this package.
//   - showHiddenVersions: return information about all the versions of the
//     package, including pre-releases and un-migrate versions.
//   - showDependencies: return information information about
//     versions' dependencies.
var PackageQuery = function (options) {
  var self = this;

  // This is the record in the packages collection. It contains things like
  // maintainers, and the package homepage.
  self.metaRecord = options.record;
  self.name = options.record.name;

  // This argument is required -- we use it to look up data. If it has not been
  // passed in, fail early.
  if (! options.projectContext) {
    throw Error("Missing required argument: projectContext");
  }
  self.projectContext = options.projectContext;
  self.localCatalog = options.projectContext.localCatalog;

  // Processing per-version availability architectures & dependencies is
  // expensive, so we don't do it unless we are asked to.
  self.showOSArchitectures = options.showOSArchitectures;
  self.showDependencies = options.showDependencies;

  // We don't want to show pre-releases and un-migrated versions to the user
  // unless they explicitly ask us about it.
  self.showHiddenVersions = options.showHiddenVersions;

  // Collect the data for this package, including looking up any specific
  // package version that we care about.
  if (options.version) {
    var versionRecord = self._getVersionRecord(options.version);
    if (! versionRecord) {
      self.data = null;
      return;
    }
    self.data =  versionRecord.local ?
      self._getLocalVersion(versionRecord) : self._getOfficialVersion(versionRecord);
  } else {
    self.data = self._collectPackageData();
  }
};

_.extend(PackageQuery.prototype, {
  // Find and return a version record for a given version. Mark the version
  // record as local, if it is a local version of the package.
  _getVersionRecord: function (version) {
    var self = this;

    // We allow local version to override remote versions in meteor show, so we
    // should start by checking if this is a local version first.
    var versionRecord = self.localCatalog.getLatestVersion(self.name);

    // If we asked for "local" as the version number, and found any local version
    // at all, we are done.
    if (version === "local") {
      return versionRecord && _.extend(versionRecord, { local: true });
    }

    // We have a local record, and its version matches the version that we asked
    // for, so we are done.
    if (versionRecord && (versionRecord.version === version)) {
      return _.extend(versionRecord, { local: true });
    }

    // If we haven't found a local record, or if the local record that we found
    // doesn't match the version that we asked for, then we have to go look in
    // the server catalog.
    versionRecord = catalog.official.getVersion(self.name, version);
    return versionRecord;
  },
  // Print the query information to screen.
  //
  // options:
  //   - ejson: Don't pretty-print the data. Return a machine-readable ejson
  //     object.
  print: function (options) {
    var self = this;

    // If we are asking for an EJSON-style output, we will only print out the
    // relevant fields.
    if (options.ejson) {
      var versionFields = [
        "name", "version", "description", "summary", "git", "dependencies",
        "publishedBy", "publishedOn", "installed", "local", "OSarchitectures"
      ];
      var packageFields =
        [ "name", "homepage", "maintainers", "versions", "totalVersions" ];
      var fields = self.data.version ? versionFields : packageFields;
      Console.rawInfo(convertToEJSON(_.pick(self.data, fields)));
      return;
    }

    // Otherwise, display the information that we have. If we were asking about
    // a specific version, display that. Otherwise, display package metadata in
    // general.
    if (self.data.version) {
      self._displayVersion(self.data);
      return;
    }
    self._displayPackage(self.data);
  },
  // Aggregates data about the package as a whole. Returns an object with the
  // following keys:
  //
  // - name: package name
  // - maintainers: an array of usernames of maintainers
  // - homepage: string homepage
  // - totalVersions: total number of versions that this package has, including
  //   local and hidden versions.
  // - defaultVersion: a default version: use this version to look up
  //   per-version information that is relevant to the package as a whole, such
  //   as git, description,etc.
  // - versions: an array of objects representing versions of this package.
  _collectPackageData: function () {
    var self = this;
    var data = {
      name: self.metaRecord.name,
      maintainers: _.pluck(self.metaRecord.maintainers, "username"),
      homepage: self.metaRecord.homepage
    };

    // Collect surface information about available versions, starting with the
    // versions available on the server.
    var serverVersionRecords =
          catalog.official.getSortedVersionRecords(self.name);
    var totalVersions = serverVersionRecords.length;

    // If we are not going to show hidden versions, then we shouldn't waste time
    // on them. Trim the serverVersionRecords array to only have the top
    // MAX_RECENT_VERSIONS migrated, official versions.
    if (! self.showHiddenVersions) {
      serverVersionRecords =
        _.filter(serverVersionRecords, function (vr) {
          return ! vr.unmigrated && vr.version.indexOf("-") === -1;
      });
      serverVersionRecords = _.last(serverVersionRecords, MAX_RECENT_VERSIONS);
    };

    // Process the catalog records into our preferred format, and look up any
    // other per-version information that we might need.
    data["versions"] = _.map(serverVersionRecords, function (versionRecord) {
      return self._getOfficialVersion(versionRecord);
    });

    // The local version doesn't count against the version limit. Look up relevant
    // information about the local version.
    var localVersion = self.localCatalog.getLatestVersion(self.name);
    if (localVersion) {
      var local = self._getLocalVersion(localVersion);
      data["versions"].push(local);
      totalVersions++;
    }

    // Record the total number of versions, including the ones we hid from the user.
    data["totalVersions"] = totalVersions;

    // Some per-version information gets displayed with the rest of the package
    // information.  We want to use the right version for that. (We don't want
    // to display data from unofficial or un-migrated versions just because they
    // are recent.)
    if (local) {
      data["defaultVersion"] = local;
    } else {
      var mainlineRecord = catalog.official.getLatestMainlineVersion(self.name);
      if (mainlineRecord) {
        data["defaultVersion"] = {
          summary: mainlineRecord.description,
          description: mainlineRecord.longDescription,
          git: mainlineRecord.git
        };
      } else {
        data["defaultVersion"] = _.last(data.versions);
      }
    }
    return data;
  },
  // Takes in a version record from the official catalog and looks up extra
  // information that's relevant to this PackageQuery.
  //
  // - name: package Name
  // - version: package version
  // - summary: version summary/short description (from Package.describe)
  // - description: long-form description (from the README.md)
  // - publishedBy: username of the publisher
  // - publishedOn: date of publication
  // - git: git URL for this version
  // - installed: true if the package exists in warehouse, and is therefore
  //   available for use offline.
  // - architectures: (optional) if self.showOSArchitectures is true, returns an
  //   array of system architectures for which that package is available.
  // - dependencies: (optional) if self.showDependencies is true, return an
  //   array of objects denoting that package's dependencies. The objects have
  //   the following keys:
  //     - packageName: name of the dependency
  //     - constraint: constraint for that dependency
  //     - weak: true if this is a weak dependency.
  _getOfficialVersion: function (versionRecord) {
    var self = this;
    var version = versionRecord.version;
    var name = self.name;
    var data = {
      name: name,
      version: version,
      summary: versionRecord.description,
      description: versionRecord.longDescription,
      publishedBy:
      versionRecord.publishedBy && versionRecord.publishedBy.username,
      publishedOn: new Date(versionRecord.published),
      git: versionRecord.git
    };

    // Processing and formatting architectures takes time, so we don't want to
    // do this if we don't have to.
    if (self.showOSArchitectures) {
      var allBuilds = catalog.official.getAllBuilds(self.name, version);
      var architectures = _.map(allBuilds, function (build) {
        return build['buildArchitectures'] &&
          build.buildArchitectures.split('+')[0];
      });
      data["OSarchitectures"] = architectures;
    }

    // Processing and formatting dependencies also takes time, so we would
    // rather not do it if we don't have to.
    if (self.showDependencies) {
      data["dependencies"] = formatDependencies(versionRecord.dependencies);
    }

    // We want to figure out if we have already downloaded this package, and,
    // therefore, can use it offline.
    var tropohouse = self.projectContext.tropohouse;
    try {
      data["installed"] = tropohouse.installed({
        packageName: name,
        version: version
      });
    } catch (e) {
      // Sometimes, we might be unable to determine if the package is installed
      // -- maybe we don't have access to the directory, or there is some sort
      // of disk corruption. This might only extend to one version, so it would
      // be awkward to fail 'meteor show' altogether. Print an error message (if
      // it is a permissions error, for example, that's something the user might
      // want to know), but don't throw.
      Console.error(e);
      data["installed"] = false;
    }
    return data;
  },

  // Takes in a version record from the local catalog and looks up extra
  // information that's relevant to this PackageQuery. Returns an object with
  // the following keys.
  //
  // - name: package Name
  // - version: package version
  // - summary: version summary/short description (from Package.describe)
  // - description: long-form description (from the README.md)
  // - git: git URL for this version
  // - local: always true (denotes that this is a local package).
  // - directory: source directory of this package.
  // - dependencies: (optional) if self.showDependencies is true, return an
  //   array of objects denoting that package's dependencies. The objects have
  //   the following keys:
  //     - packageName: name of the dependency
  //     - constraint: constraint for that dependency
  //     - weak: true if this is a weak dependency.
  _getLocalVersion: function (localRecord) {
    var self = this;
    var data =  {
      name: self.name,
      summary: localRecord.description,
      git: localRecord.git,
      local: true
    };

    // Get the source directory.
    var packageSource = self.localCatalog.getPackageSource(self.name);
    data["directory"] = packageSource.sourceRoot;

    // If the version was not explicitly set by the user, the catalog backfills
    // a placeholder version for the constraint solver. We don't want to show
    // that version to the user.
    data["version"] = packageSource.versionExplicitlyProvided ?
      localRecord.version : "local";

    // Processing dependencies takes time, and we don't want to do it if we
    // don't have to.
    if (self.showDependencies) {
      data["dependencies"] = formatDependencies(localRecord.dependencies);
    }

    var readmeInfo;
    main.captureAndExit("=> Errors while reading local packages:", function () {
      buildmessage.enterJob("reading " + data["directory"], function () {
        readmeInfo = packageSource.processReadme();
      });
    });
    if (readmeInfo) {
      data["description"] = readmeInfo.excerpt;
    }
    return data;
  },
  // Displays version information from this PackageQuery to the terminal in a
  // human-friendly format. Takes in an object that contains some, but not all,
  // of the following keys:
  //
  // - name: (mandatory) package Name
  // - version: (mandatory) package version
  // - summary: version summary/short description (from Package.describe)
  // - publishedBy: username of the publisher
  // - publishedOn: date of publication
  // - description: long-form description (from the README.md)
  // - git: git URL for this version.
  // - local: true for a local version of a package.
  // - directory: source directory of this package.
  // - installed: true if the package exists in warehouse, and is therefore
  //   available for use offline.
  // - architectures: if self.showOSArchitectures is true, returns an
  //   array of system architectures for which that package is available.
  // - dependencies: an array of package dependencies, as objects with the
  //   following keys:
  //     - packageName: name of the dependency
  //     - constraint: constraint for that dependency
  //     - weak: true if this is a weak dependency.
  _displayVersion: function (data) {
    var self = this;
    Console.info("Package:", data.name);
    Console.info("Version:", data.version);
    if (data.summary) {
      Console.info("Summary:", data.summary);
    }
    if (data.publishedBy) {
      var publisher = data.publishedBy;
      var pubDate = utils.longformDate(data.publishedOn);
      Console.info("Published by", publisher, "on", pubDate);
    }
    if (data.git) {
      Console.info("Git:", Console.url(data.git));
    }
    if (data.directory) {
      Console.info("Directory:", Console.path(data.directory));
    }
    Console.info();

    // If we don't have a long-form description, print the summary. (If we don't
    // have a summary, print nothing).
    if (data.description || data.summary) {
      Console.info(data.description || data.summary);
      Console.info();
    }

    // Print dependency information, if the package has any dependencies.
    if (_.has(data, "dependencies") &&
        ! _.isEmpty(data.dependencies)) {
      Console.info("Depends on:");
      _.each(data.dependencies, function (dep) {
        var depString = dep.name;
        if (dep.constraint && dep.constraint !== null) {
          depString += "@" + dep.constraint;
        }
        if (dep.weak) {
          depString += " (weak dependency)";
        }
        Console.info(
          Console.noWrap(depString),
          Console.options({ indent: 2 }));
      });
    }

    // Sometimes, there is a server package and a local package with the same
    // version. In this case, we prefer the local package. Explain our choice to
    // the user.
    if (data.local &&
        catalog.official.getVersion(data.name, data.version)) {
      Console.info();
      Console.info(
        "The same version of this package also exists on the package server.",
        "To view its metadata, run",
        Console.command("'meteor show " + data.name + "@" + data.version + "'"),
        "from outside the project.");
    }
  },
  // Displays general package data from this PackageQuery to the terminal in a
  // human-friendly format. Takes in an object that contains some, but not
  // always all, of the following keys:
  //
  // - name: (mandatory) package name
  // - maintainers: array of usernames of maintainers
  // - homepage: string of the package homepage
  // - defaultVersion: the default version of this package to use for looking up
  //   per-version information that's relevant to the package in general (ex:
  //   git).
  // - totalVersions: the total number of versions that this package has,
  //   including hidden versions.
  // - versions: an ordered array of objects, representing the versions of this
  //   package that we should return to the user. Each version should contain
  //   some of the following keys:
  //     - version: (mandatory) version number, or "local" for a version-less
  //       local package.
  //     - publishedOn: the date that the package was published.
  //     - installed: true if this is a server package that has already been
  //       downloaded to the warehouse.
  //     - local: true for a local package.
  //     - directory: source root directory of a local package.
  _displayPackage: function (data) {
    var self = this;
    var defaultVersion = data.defaultVersion;

    // Every package has a name. Some packages have a homepage.
    Console.info("Package:", data.name);
    if (data.homepage) {
      Console.info("Homepage:", Console.url(data.homepage));
    }
    // Git is per-version, so we will print the latest one, if one exists.
    if (defaultVersion && defaultVersion.git) {
      Console.info("Git:", Console.url(defaultVersion.git));
    }
    // Local packages might not have any maintainers.
    if (! _.isEmpty(data.maintainers)) {
      Console.info("Maintainers:", data.maintainers.join(", "));
    }
    Console.info();

    // If we don't have a long-form description, we will use the summary. For a
    // local package, we might not have a summary, in which case we should be
    // careful not to print extra lines.
    var printDescription = defaultVersion &&
      (defaultVersion.description || defaultVersion.summary);
    if (printDescription) {
      Console.info(printDescription );
      Console.info();
    }

    var totalShownVersions = 0;
    // If we have any versions to show, print them out now.
    if (data.versions && ! _.isEmpty(data.versions)) {
      var versionsHeader =
            self.showHiddenVersions ? "Versions:" : "Recent versions:";
      Console.info(versionsHeader);
      var rows = [];
      _.each(data.versions, function (v) {
        totalShownVersions++;

        // For a local package, we don't have a published date, and we don't
        // need to show if it has already been downloaded (it is local, we don't
        // need to download it). Instead of showing both of these values, let's
        // show the directory.
        if (v.local) {
          rows.push([v.version, v.directory]);
          return;
        }

        // Convert the date into a display-friendly format, or print nothing for
        // a local package.
        var publishDate = utils.longformDate(v.publishedOn);

        // If there is a status that we would like to report for this package,
        // figure it out now.
        if (v.installed) {
          var paddedDate = padLongformDate(publishDate);
          rows.push([v.version, paddedDate + "  " + "installed"]);
        } else {
          rows.push([v.version, publishDate]);
        }
      });
      // The only time that we are going to go over a reasonable character limit
      // is with a directory for the local package. We would much rather display
      // the full directory than trail it off.
      Console.printTwoColumns(rows, { indent: 2, ignoreWidth: true });
    }

    // If we have not shown all the available versions, let the user know.
    if (data.totalVersions > totalShownVersions) {
      var versionsPluralizer =
            (data.totalVersions > 1) ?
            "all " + data.totalVersions + " versions" :
            "the hidden version";
      Console.info(
        "Some versions of", self.name, "have been hidden.",
        "To see " + versionsPluralizer + ", run",
        Console.command("'meteor show --show-all " + self.name + "'") + ".");
    }
  }
});

// This class looks up release-related information in the official catalog.
//
// The constructor takes in an object with the following keys:
//   - record: (mandatory) the meta-record for this release from the Releases
//     collection.
//   - version: specific version of a release that we want to query.
//   - showHiddenVersions: show experimental, pre-release & otherwise
//     non-recommended versions of this release.
var ReleaseQuery = function (options) {
  var self = this;

  // This is the record in the Releases collection. Contains metadata, such as
  // maintainers.
  self.metaRecord = options.record;
  self.name = options.record.name;

  // We don't always want to show non-recommended release versions.
  self.showHiddenVersions = options.showHiddenVersions;

  // Aggregate the query data. If we are asking for a specific version, get data
  // for a specific version, otherwise aggregate the data about this release
  // track in general.
  self.data = options.version ?
    self._getVersionDetails(options.version) :
    self._getReleaseData();
};

_.extend(ReleaseQuery.prototype, {
  // Prints the data from this ReleaseQuery to the terminal. Takes the following
  // options:
  //   - ejson: Don't pretty-print the data. Return a machine-readable ejson
  //     object.
  print: function (options) {
    var self = this;

    // If we are asking for an EJSON-style output, print out the relevant fields.
    if (options.ejson) {
      var versionFields = [
        "track", "version", "description", "publishedBy", "publishedOn",
        "tool", "packages", "recommended"
      ];
      var packageFields = [ "name", "maintainers", "versions" ];
      var fields = self.data.version ? versionFields : packageFields;
      Console.rawInfo(convertToEJSON(_.pick(self.data, fields)));
      return;
    }

    // If we are asking for a specific version, display the information about
    // that version.
    if (self.data.version) {
      self._displayVersion(self.data);
      return;
    }
    // Otherwise, print the data about this release track in general.
    self._displayRelease(self.data);
  },

  // Gets detailed data about a specific version of this release. Returns an
  // object with the following keys:
  //  - track: name of the release track
  //  - version: release version
  //  - description: description of the release version
  //  - recommended: if this is a recommended version.
  //  - orderKey: the orderKey of this version
  //  - publishedBy: username of the publisher
  //  - publishedOn: date this version was published
  //  - packages: map of packages that go into this version
  //  - tool: the tool package@version for this release version
  _getVersionDetails: function (version) {
    var self = this;
    var versionRecord =
       catalog.official.getReleaseVersion(self.name, version);
    if (! versionRecord) {
      return null;
    }
    var publishDate = getReleaseVersionPublishedOn(versionRecord);
    return {
      track: self.name,
      version: version,
      description: versionRecord.description,
      recommended: versionRecord.recommended,
      orderKey: versionRecord.orderKey,
      publishedBy: versionRecord.publishedBy["username"],
      pubishedOn: publishDate,
      packages: versionRecord.packages,
      tool: versionRecord.tool
    };
  },
  // Gets aggregate data about this release track in general. Returns an object
  // with the following keys:
  //    - track: name of the release track
  //    - maintainers: an array of usernames of maintainers
  //    - defaultVersion: version record for the default version of this release.
  //    - totalVersions: total number of release versions for this track
  //    - versions: an array of version objects. If only recommended versions
  //      are returned, ordered by orderKey, otherwise unordered. Objects have
  //      the following keys:
  //         - version: version number
  //         - description: version description
  //         - recommended: true for recommended versions
  //         - orderKey: (only if showHiddenVersions is true) the orderKey of
  //           this version.
  //         - publishedBy: username of the publisher
  //         - publishedOn: date the version was published
  _getReleaseData: function () {
    var self = this;
    var data = {
      track: self.metaRecord.name,
      maintainers: _.pluck(self.metaRecord.maintainers, "username")
    };
    data["defaultVersion"] =
      catalog.official.getDefaultReleaseVersionRecord(self.name);

    // Collect information about versions.
    var versions = self.showHiddenVersions ?
      catalog.official.getReleaseVersionRecords(self.name) :
      catalog.official.getSortedRecommendedReleaseRecords(self.name);
    versions.reverse();

    // We don't want to show the user package or tool data in general release
    // mode (it is a lot of data). Select to show the fields that we want to
    // return only.
    var versionFields =
       [ "version", "description", "recommended"];

    // orderKey is important for dealing with experimental versions, but it is
    // an internal system detail that we would rather not reveal at this level.
    if (self.showHiddenVersions) {
      versionFields.push("orderKey");
    }
    data["versions"] = _.map(versions, function (versionRecord) {
      var data = _.pick(versionRecord, versionFields);
      data.publishedBy = versionRecord.publishedBy["username"];
      data.publishedOn = getReleaseVersionPublishedOn(versionRecord);
      return data;
    });
    data["totalVersions"] = catalog.official.getNumReleaseVersions(self.name);
    return data;
  },
  // Displays information about a specific release version in a human-readable
  // format. Takes in an object with the following keys:
  // - track: release track
  // - version: release version
  // - publishedBy: username of the publisher
  // - publishedOn: date the version was published
  // - recommended: true if this is a recommended version
  // - description: description of the release version
  // - tool: tool package specification for this version
  // - packages: map of packages for this release version
  _displayVersion: function (data) {
    var self = this;
    Console.info("Release: " + data.track);
    Console.info("Version: " + data.version);
    Console.info(
      "Published by " + data.publishedBy + " on " +
      utils.longformDate(getReleaseVersionPublishedOn(data)));
    Console.info("Tool package: " + data.tool);
    var isRecommended = data.recommended ? "yes" : "no";
    Console.info("Recommended: " + isRecommended);
    Console.info();
    Console.info(data.description);
    Console.info();
    if (!_.isEmpty(data.packages)) {
      Console.info("Packages:");
      _.each(data.packages, function (version, package) {
          Console.info(
            package + ": " + version,
            Console.options({ indent: 2 }));
      });
    }
  },
  // Displays information about this release track in general in a
  // human-readable format. Takes in an object with the following keys:
  //    - track: name of the release track
  //    - maintainers: an array of usernames of maintainers
  //    - defaultVersion: version record for the default version of this release.
  //    - totalVersions: total number of release versions for this track
  //    - versions: an array of version objects. If only recommended versions
  //      are returned, ordered by orderKey, otherwise unordered. Objects have
  //      the following keys:
  //         - version: version number
  //         - description: version description
  //         - recommended: true for recommended versions
  //         - orderKey: (only if showHiddenVersions is true) the orderKey of
  //           this version.
  //         - publishedBy: username of the publisher
  //         - publishedOn: date the version was published
  _displayRelease: function (data) {
    var self = this;

    Console.info("Release:",  data.track);
    // There is no such thing as a local release, which means all releases have
    // a maintainer.
    Console.info("Maintainers:", data.maintainers.join(", "));
    Console.info();

    if (data.defaultVersion) {
      Console.info(data.defaultVersion.description);
      Console.info();
    }

    if (self.showHiddenVersions) {
      self._displayAllReleaseVersions(data.versions);
      return;
    }

    // Display the recommended versions of this release.
    var versionsShown = 0;
    if (!_.isEmpty(data.versions)) {
      Console.info("Recommended versions:");
      var rows = [];
      _.each(data.versions, function (v) {
        rows.push([v.version, utils.longformDate(v.publishedOn)]);
        versionsShown++;
      });
      Console.printTwoColumns(rows, { indent: 2 });
    };

    // Display a warning about other release versions at the bottom.
    if (data.totalVersions > versionsShown) {
      var versionsPluralizer =
            (data.totalVersions > 1) ?
            "all " + data.totalVersions + " versions" :
            "the hidden version";
      Console.info(
        "Some versions of", self.name, "have been hidden.",
        "To see " + versionsPluralizer + ", run",
        Console.command("'meteor show --show-all " + self.name + "'") + ".");
    }
  },
  // Displays all the versions of a given release in a human-readable
  // format. Includes experimental and otherwise hidden versions. Takes in an
  // array of version objects, each of which has the following keys:
  //  - version: version string
  //  - orderKey: (optional) orderKey of this version. Not all versions have
  //    orderKeys.
  //  - publishedOn: date of publication
  //  - recommended: true if the version is recommended.
  _displayAllReleaseVersions: function (versions) {
    var self = this;
    var columnOpts = { indent: 2, ignoreWidth: true };
    // If we don't have any versions, then there is nothing to display.
    if (! versions) { return; }

    // We are going to print versions with order key ('versions'), separately
    // from versions without an order key ('experimental versions').
    var versionsDivided = _.groupBy(versions, function (v) {
      return _.has(v, "orderKey");
    });
    var experimentalVersions = versionsDivided[false];
    var versionsWithKey = versionsDivided[true];

    if (versionsWithKey) {
      // Sort versions that have order keys by order key, so that 1.0 comes
      // after 0.9.4.1, etc.
      versionsWithKey = _.sortBy(versionsWithKey, function (v) {
        return v.orderKey;
      });
      Console.info("Versions:");
      var rows = [];
      _.each(versionsWithKey, function (vr) {
        var dateStr = utils.longformDate(vr.publishedOn);
        if (! vr.recommended) {
          rows.push([ vr.version, dateStr ]);
        } else {
          var paddedDate = padLongformDate(dateStr);
          rows.push([ vr.version, paddedDate + "  (recommended)" ]);
        }
      });
      Console.printTwoColumns(rows, columnOpts);
    }

    if (experimentalVersions) {
      // We can't sort by order key, so sort by order of publication.
      experimentalVersions = _.sortBy(experimentalVersions, function (v) {
        return v.publishedOn;
      });
      Console.info("Experimental versions:");
      var rows = [];
      _.each(experimentalVersions, function (vr) {
        // Experimental versions cannot be recommended.
        rows.push([vr.version, utils.longformDate(vr.publishedOn)]);
      });
      Console.printTwoColumns(rows, columnOpts);
    }
  }
});

main.registerCommand({
  name: 'show',
  pretty: true,
  minArgs: 1,
  maxArgs: 1,
  usesPackage: true,
  options: {
    "show-all": { type: Boolean, required: false },
    "ejson": { type: Boolean, required: false }
  },
  catalogRefresh:
    new catalog.Refresh.OnceAtStart(
        { maxAge: DEFAULT_MAX_AGE_MS, ignoreErrors: true })
}, function (options) {
  // The foo@bar API means that we have to do some string parsing to figure out
  // if we want a particular version.
  var itemName = options.args[0];
  var splitArgs = itemName.split('@');
  var name = splitArgs[0];
  var version = (splitArgs.length > 1) ? splitArgs[1] : null;
  var query = null;

  // Because of the new projectContext interface, we need to initialize the
  // project context in order to load the local catalog. This is not ideal.
  var projectContext = getTempContext(options);

  // First, we need to figure out if we are dealing with a package, or a
  // release. We don't want to rely on capitalization conventions, so we will
  // start by checking if a package by that name exists. If it does, then we
  // are dealing with a package.
  var packageRecord =
        catalog.official.getPackage(name) ||
        projectContext.localCatalog.getPackage(name);
  if (packageRecord) {
    query =  new PackageQuery({
      record: packageRecord,
      version: version,
      projectContext: projectContext,
      showHiddenVersions: options["show-all"],
      showOSArchitectures: options.ejson,
      showDependencies: !! version
    });
  }

  // If this is not a package, it might be a release. Let's check if there is
  // a release by this name. There are no local releases, so we only need to
  // check the official catalog.
  if (! query) {
    var releaseRecord = catalog.official.getReleaseTrack(name);
    if (releaseRecord) {
      query = new ReleaseQuery({
        record: releaseRecord,
        version: version,
        showHiddenVersions: options["show-all"]
      });
    }
  }
  // If we have failed to create a query, or if we have created a query and it
  // couldn't gather any data about our request, then the item that we are
  // looking for does not exist.
  if (! query || ! query.data) {
    return itemNotFound(itemName);
  }

  query.print({ ejson: !! options.ejson });
  return 0;
});


///////////////////////////////////////////////////////////////////////////////
// search
///////////////////////////////////////////////////////////////////////////////

main.registerCommand({
  name: 'search',
  pretty: true,
  usesPackage: true,
  minArgs: 0, // So we can provide specific help
  maxArgs: 1,
  options: {
    maintainer: { type: String, required: false },
    "show-all": { type: Boolean, required: false },
    ejson: { type: Boolean, required: false },
    // Undocumented debug-only option for Velocity.
    "debug-only": { type: Boolean, required: false }
  },
  catalogRefresh:
    new catalog.Refresh.OnceAtStart(
      { maxAge: DEFAULT_MAX_AGE_MS, ignoreErrors: true })
}, function (options) {
  if (options.args.length === 0) {
    Console.info(
      "To show all packages, do", Console.command("meteor search ."));
    return 1;
  }

  // Because of the new projectContext interface, we need to initialize the
  // project context in order to load the local catalog.
  var projectContext = getTempContext(options);

  // XXX We should push the queries into SQLite!
  var allPackages = _.union(
    catalog.official.getAllPackageNames(),
    projectContext.localCatalog.getAllPackageNames());
  var allReleases = catalog.official.getAllReleaseTracks();
  var matchingPackages = [];
  var matchingReleases = [];

  var selector;
  var pattern = options.args[0];

  var search;
  try {
    search = new RegExp(pattern);
  } catch (err) {
    Console.error(err + "");
    return 1;
  }

  // Do not return true on broken packages, unless requested in options.
  var filterBroken = function (match, isRelease, name) {
    // If the package does not match, or it is not a package at all or if we
    // don't want to filter anyway, we do not care.
    if (!match || isRelease)
      return match;
    var vr;
    if (!options["show-all"]) {
      // If we can't find a version in the local catalog, we want to get the
      // latest mainline (ie: non-RC) version from the official catalog.
      vr = projectContext.localCatalog.getLatestVersion(name) ||
        catalog.official.getLatestMainlineVersion(name);
    } else {
      // We want the latest version of this package, and we don't care if it is
      // a release candidate.
      vr = projectContext.layeredCatalog.getLatestVersion(name);
    }
    if (!vr) {
      return false;
    }
    // If we did NOT ask for unmigrated packages and this package is unmigrated,
    // we don't care.
    if (!options["show-all"] && vr.unmigrated){
      return false;
    }
    // If we asked for debug-only packages and this package is NOT debug only,
    // we don't care.
    if (options["debug-only"] && !vr.debugOnly) {
      return false;
    }
    return true;
  };

  if (options.maintainer) {
    var username =  options.maintainer;
    // In the future, we should consider checking this on the server, but I
    // suspect the main use of this command will be to deal with the automatic
    // migration and uncommon in everyday use. From that perspective, it makes
    // little sense to require you to be online to find out what packages you
    // own; and the consequence of not mentioning your group packages until
    // you update to a new version of meteor is not that dire.
    selector = function (name, isRelease) {
      var record;
      // XXX make sure search works while offline
      if (isRelease) {
        record = catalog.official.getReleaseTrack(name);
      } else {
        record = catalog.official.getPackage(name);
      }
      return filterBroken((name.match(search) &&
        !!_.findWhere(record.maintainers, {username: username})),
        isRelease, name);
    };
  } else {
    selector = function (name, isRelease) {
      return filterBroken(name.match(search),
        isRelease, name);
    };
  }

  buildmessage.enterJob({ title: 'Searching packages' }, function () {
    _.each(allPackages, function (pack) {
      if (selector(pack, false)) {
        var vr;
        if (!options['show-all']) {
          vr =
            projectContext.localCatalog.getLatestVersion(pack) ||
            catalog.official.getLatestMainlineVersion(pack);
        } else {
          vr = projectContext.layeredCatalog.getLatestVersion(pack);
        }
        if (vr) {
          matchingPackages.push({
            name: pack,
            description: vr.description,
            latestVersion: vr.version,
            lastUpdated: new Date(vr.lastUpdated)
          });
        }
      }
    });
    _.each(allReleases, function (track) {
      if (selector(track, true)) {
        var vr = catalog.official.getDefaultReleaseVersionRecord(track);
        if (vr) {
          matchingReleases.push({
            name: track,
            description: vr.description,
            latestVersion: vr.version,
            lastUpdated: new Date(vr.lastUpdated)
          });
        }
      }
    });
  });

  if (options.ejson) {
    var ret = {
      packages: matchingPackages,
      releases: matchingReleases
    };
    Console.rawInfo(convertToEJSON(ret));
    return 0;
  }

  var output = false;
  if (!_.isEqual(matchingPackages, [])) {
    output = true;
    Console.info("Matching packages:");
    utils.printPackageList(matchingPackages);
  }

  if (!_.isEqual(matchingReleases, [])) {
    output = true;
    Console.info("Matching releases:");
    utils.printPackageList(matchingReleases);
  }

  if (!output) {
    Console.error(pattern + ': nothing found');
    utils.explainIfRefreshFailed();
  } else {
    Console.info(
      "You can use", Console.command("'meteor show'"),
      "to get more information on a specific item.");
  }
});
