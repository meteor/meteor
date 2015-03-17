var assert = require("assert");
var _ = require("underscore");
var buildmessage = require('./buildmessage.js');
var utils = require('./utils.js');
var compiler = require('./compiler.js');
var archinfo = require('./archinfo.js');
var files = require('./files.js');
var catalog = require('./catalog.js');

function toArray (x) {
  if (_.isArray(x))
    return x;
  return x ? [x] : [];
}

function toArchArray (arch) {
  if (! _.isArray(arch)) {
    arch = arch ? [arch] : compiler.ALL_ARCHES;
  }
  arch = _.uniq(arch);
  arch = _.map(arch, mapWhereToArch);
  _.each(arch, function (inputArch) {
    var isMatch = _.any(_.map(compiler.ALL_ARCHES, function (actualArch) {
      return archinfo.matches(actualArch, inputArch);
    }));
    if (! isMatch) {
      buildmessage.error(
        "Invalid 'where' argument: '" + inputArch + "'",
        // skip toArchArray in addition to the actual API function
        {useMyCaller: 2});
    }
  });
  return arch;
}

// We currently have a 1 to 1 mapping between 'where' and 'arch'.
// 'client' -> 'web'
// 'server' -> 'os'
// '*' -> '*'
function mapWhereToArch (where) {
  if (where === 'server') {
    return 'os';
  } else if (where === 'client') {
    return 'web';
  } else {
    return where;
  }
}

// Iterates over the list of target archs and calls f(arch) for all archs
// that match an element of self.allarchs.
function forAllMatchingArchs (archs, f) {
  _.each(archs, function (arch) {
    _.each(compiler.ALL_ARCHES, function (matchArch) {
      if (archinfo.matches(matchArch, arch)) {
        f(matchArch);
      }
    });
  });
}

/**
 * @name  PackageAPI
 * @class PackageAPI
 * @instanceName api
 * @global
 * @summary Type of the API object passed into the `Package.onUse` function.
 */
function PackageAPI (options) {
  var self = this;
  assert.ok(self instanceof PackageAPI);

  options = options || {};

  self.buildingIsopackets = !!options.buildingIsopackets;

  // source files used
  self.sources = {};

  // symbols exported
  self.exports = {};

  // packages used and implied (keys are 'package', 'unordered', and
  // 'weak').  an "implied" package is a package that will be used by a unibuild
  // which uses us.
  self.uses = {};
  self.implies = {};

  _.each(compiler.ALL_ARCHES, function (arch) {
    self.sources[arch] = [];
    self.exports[arch] = [];
    self.uses[arch] = [];
    self.implies[arch] = [];
  });

  self.releaseRecords = [];
}

_.extend(PackageAPI.prototype, {
  // Called when this package wants to make another package be
  // used. Can also take literal package objects, if you have
  // anonymous packages you want to use (eg, app packages)
  //
  // @param arch 'web', 'web.browser', 'web.cordova', 'server',
  // or an array of those.
  // The default is ['web', 'server'].
  //
  // options can include:
  //
  // - unordered: if true, don't require this package to load
  //   before us -- just require it to be loaded anytime. Also
  //   don't bring this package's imports into our
  //   namespace. If false, override a true value specified in
  //   a previous call to use for this package name. (A
  //   limitation of the current implementation is that this
  //   flag is not tracked per-environment or per-role.)  This
  //   option can be used to resolve circular dependencies in
  //   exceptional circumstances, eg, the 'meteor' package
  //   depends on 'handlebars', but all packages (including
  //   'handlebars') have an implicit dependency on
  //   'meteor'. Internal use only -- future support of this
  //   is not guaranteed. #UnorderedPackageReferences
  //
  // - weak: if true, don't require this package to load at all, but if
  //   it's going to load, load it before us.  Don't bring this
  //   package's imports into our namespace and don't allow us to use
  //   its plugins. (Has the same limitation as "unordered" that this
  //   flag is not tracked per-environment or per-role; this may
  //   change.)

  /**
   * @memberOf PackageAPI
   * @instance
   * @summary Depend on package `packagename`.
   * @locus package.js
   * @param {String|String[]} packageNames Packages being depended on.
   * Package names may be suffixed with an @version tag.
   *
   * In general, you must specify a package's version (e.g.,
   * `'accounts@1.0.0'` to use version 1.0.0 or a higher
   * compatible version (ex: 1.0.1, 1.5.0, etc.)  of the
   * `accounts` package). If you are sourcing core
   * packages from a Meteor release with `versionsFrom`, you may leave
   * off version names for core packages. You may also specify constraints,
   * such as `my:forms@=1.0.0` (this package demands `my:forms` at `1.0.0` exactly),
   * or `my:forms@1.0.0 || =2.0.1` (`my:forms` at `1.x.y`, or exactly `2.0.1`).
   * @param {String} [architecture] If you only use the package on the
   * server (or the client), you can pass in the second argument (e.g.,
   * `'server'`, `'client'`, `'web.browser'`, `'web.cordova'`) to specify
   * what architecture the package is used with.
   * @param {Object} [options]
   * @param {Boolean} options.weak Establish a weak dependency on a
   * package. If package A has a weak dependency on package B, it means
   * that including A in an app does not force B to be included too — but,
   * if B is included or by another package, then B will load before A.
   * You can use this to make packages that optionally integrate with or
   * enhance other packages if those packages are present.
   * When you weakly depend on a package you don't see its exports.
   * You can detect if the possibly-present weakly-depended-on package
   * is there by seeing if `Package.foo` exists, and get its exports
   * from the same place.
   * @param {Boolean} options.unordered It's okay to load this dependency
   * after your package. (In general, dependencies specified by `api.use`
   * are loaded before your package.) You can use this option to break
   * circular dependencies.
   */
  use: function (names, arch, options) {
    var self = this;

    // Support `api.use(package, {weak: true})` without arch.
    if (_.isObject(arch) && !_.isArray(arch) && !options) {
      options = arch;
      arch = null;
    }
    options = options || {};

    names = toArray(names);
    arch = toArchArray(arch);

    // A normal dependency creates an ordering constraint and a "if I'm
    // used, use that" constraint. Unordered dependencies lack the
    // former; weak dependencies lack the latter. There's no point to a
    // dependency that lacks both!
    if (options.unordered && options.weak) {
      buildmessage.error(
        "A dependency may not be both unordered and weak.",
        { useMyCaller: true });
      // recover by ignoring
      return;
    }

    // using for loop rather than underscore to help with useMyCaller
    for (var i = 0; i < names.length; ++i) {
      var name = names[i];
      try {
        var parsed = utils.parsePackageConstraint(name);
      } catch (e) {
        if (!e.versionParserError)
          throw e;
        buildmessage.error(e.message, {useMyCaller: true});
        // recover by ignoring
        continue;
      }

      forAllMatchingArchs(arch, function (a) {
        self.uses[a].push({
          package: parsed.package,
          constraint: parsed.constraintString,
          unordered: options.unordered || false,
          weak: options.weak || false
        });
      });
    }
  },

  // Called when this package wants packages using it to also use
  // another package.  eg, for umbrella packages which want packages
  // using them to also get symbols or plugins from their components.

  /**
   * @memberOf PackageAPI
   * @summary Give users of this package access to another package (by passing  in the string `packagename`) or a collection of packages (by passing in an  array of strings [`packagename1`, `packagename2`]
   * @locus package.js
   * @instance
   * @param {String|String[]} packageSpecs Name of a package, or array of package names, with an optional @version component for each.
   */
  imply: function (names, arch) {
    var self = this;

    // We currently disallow build plugins in debugOnly packages; but if
    // you could use imply in a debugOnly package, you could pull in the
    // build plugin from an implied package, which would have the same
    // problem as allowing build plugins directly in the package. So no
    // imply either!
    if (self.debugOnly) {
      buildmessage.error("can't use imply in debugOnly packages");
      // recover by ignoring
      return;
    }

    names = toArray(names);
    arch = toArchArray(arch);

    // using for loop rather than underscore to help with useMyCaller
    for (var i = 0; i < names.length; ++i) {
      var name = names[i];
      try {
        var parsed = utils.parsePackageConstraint(name);
      } catch (e) {
        if (!e.versionParserError)
          throw e;
        buildmessage.error(e.message, {useMyCaller: true});
        // recover by ignoring
        continue;
      }

      forAllMatchingArchs(arch, function (a) {
        // We don't allow weak or unordered implies, since the main
        // purpose of imply is to provide imports and plugins.
        self.implies[a].push({
          package: parsed.package,
          constraint: parsed.constraintString
        });
      });
    }
  },

  // Top-level call to add a source file to a package. It will
  // be processed according to its extension (eg, *.coffee
  // files will be compiled to JavaScript).

  /**
   * @memberOf PackageAPI
   * @instance
   * @summary Specify the source code for your package.
   * @locus package.js
   * @param {String|String[]} filename Name of the source file, or array of strings of source file names.
   * @param {String} [architecture] If you only want to export the file
   * on the server (or the client), you can pass in the second argument
   * (e.g., 'server', 'client', 'web.browser', 'web.cordova') to specify
   * what architecture the file is used with.
   */
  addFiles: function (paths, arch, fileOptions) {
    var self = this;

    paths = toArray(paths);
    arch = toArchArray(arch);

    // Convert Dos-style paths to Unix-style paths.
    // XXX it is possible to convert an already Unix-style path by mistake
    // and break it. e.g.: 'some\folder/anotherFolder' is a valid path
    // consisting of two components. #WindowsPathApi
    paths = _.map(paths, function (p) {
      if (p.indexOf('/') !== -1) {
        // it is already a Unix-style path most likely
        return p;
      }
      return files.convertToPosixPath(p, true);
    });

    _.each(paths, function (path) {
      forAllMatchingArchs(arch, function (a) {
        var source = {relPath: path};
        if (fileOptions)
          source.fileOptions = fileOptions;
        self.sources[a].push(source);
      });
    });
  },

  // Use this release to resolve unclear dependencies for this package. If
  // you don't fill in dependencies for some of your implies/uses, we will
  // look at the packages listed in the release to figure that out.

  /**
   * @memberOf PackageAPI
   * @instance
   * @summary Use versions of core packages from a release. Unless provided, all packages will default to the versions released along with `meteorRelease`. This will save you from having to figure out the exact versions of the core packages you want to use. For example, if the newest release of meteor is `METEOR@0.9.0` and it includes `jquery@1.0.0`, you can write `api.versionsFrom('METEOR@0.9.0')` in your package, and when you later write `api.use('jquery')`, it will be equivalent to `api.use('jquery@1.0.0')`. You may specify an array of multiple releases, in which case the default value for constraints will be the "or" of the versions from each release: `api.versionsFrom(['METEOR@0.9.0', 'METEOR@0.9.5'])` may cause `api.use('jquery')` to be interpreted as `api.use('jquery@1.0.0 || 2.0.0')`.
   * @locus package.js
   * @param {String | String[]} meteorRelease Specification of a release: track@version. Just 'version' (e.g. `"0.9.0"`) is sufficient if using the default release track `METEOR`.
   */
  versionsFrom: function (releases) {
    var self = this;

    // Packages in isopackets really ought to be in the core release, by
    // definition, so saying that they should use versions from another
    // release doesn't make sense. Moreover, if we're running from a
    // checkout, we build isopackets before we initialize catalog.official
    // (since we may need the ddp isopacket to refresh catalog.official),
    // so we wouldn't actually be able to interpret the release name
    // anyway.
    if (self.buildingIsopackets) {
      buildmessage.error(
        "packages in isopackets may not use versionsFrom");
      // recover by ignoring
      return;
    }

    releases = toArray(releases);

    // using for loop rather than underscore to help with useMyCaller
    for (var i = 0; i < releases.length; ++i) {
      var release = releases[i];

      // If you don't specify a track, use our default.
      if (release.indexOf('@') === -1) {
        release = catalog.DEFAULT_TRACK + "@" + release;
      }

      var relInf = release.split('@');
      if (relInf.length !== 2) {
        buildmessage.error("Release names in versionsFrom may not contain '@'.",
                           { useMyCaller: true });
        return;
      }
      var releaseRecord = catalog.official.getReleaseVersion(
        relInf[0], relInf[1]);
      if (!releaseRecord) {
        buildmessage.error("Unknown release "+ release,
                           { tags: { refreshCouldHelp: true } });
      } else {
        self.releaseRecords.push(releaseRecord);
      }
    }
  },

  // Export symbols from this package.
  //
  // @param symbols String (eg "Foo") or array of String
  // @param arch 'web', 'server', 'web.browser', 'web.cordova'
  // or an array of those.
  // The default is ['web', 'server'].
  // @param options 'testOnly', boolean.

  /**
   * @memberOf PackageAPI
   * @instance
   * @summary Export package-level variables in your package. The specified variables (declared without `var` in the source code) will be available to packages that use this package.
   * @locus package.js
   * @param {String} exportedObject Name of the object.
   * @param {String} [architecture] If you only want to export the object
   * on the server (or the client), you can pass in the second argument
   * (e.g., 'server', 'client', 'web.browser', 'web.cordova') to specify
   * what architecture the export is used with.
   */
  export: function (symbols, arch, options) {
    var self = this;

    // Support `api.export("FooTest", {testOnly: true})` without
    // arch.
    if (_.isObject(arch) && !_.isArray(arch) && !options) {
      options = arch;
      arch = null;
    }
    options = options || {};

    symbols = toArray(symbols);
    arch = toArchArray(arch);

    _.each(symbols, function (symbol) {
      // XXX be unicode-friendlier
      if (!symbol.match(/^([_$a-zA-Z][_$a-zA-Z0-9]*)$/)) {
        buildmessage.error("Bad exported symbol: " + symbol,
                           { useMyCaller: true });
        // recover by ignoring
        return;
      }
      forAllMatchingArchs(arch, function (w) {
        self.exports[w].push({name: symbol, testOnly: !!options.testOnly});
      });
    });
  }
});

// XXX COMPAT WITH 0.8.x
PackageAPI.prototype.add_files = PackageAPI.prototype.addFiles;

exports.PackageAPI = PackageAPI;
