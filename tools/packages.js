var path = require('path');
var _ = require('underscore');
var files = require('./files.js');
var warehouse = require('./warehouse.js');
var bundler = require('./bundler.js');
var project = require('./project.js');
var meteorNpm = require('./meteor_npm.js');
var fs = require('fs');

// Under the hood, packages in the library (/package/foo), and user
// applications, are both Packages -- they are just represented
// differently on disk.
//
// To create a package object from a package in the library:
//   var pkg = new Package;
//   pkg.init_from_library(name);
//
// To create a package object from an app directory:
//   var pkg = new Package;
//   pkg.init_from_app_dir(app_dir);

// In general in this file, `packageSearchOptions` means an optional object with
// keys (all optional):
//    - `releaseManifest` (a parsed release manifest)
//    - `appDir` (directory which may contain a `packages` subdir)
//    - `preloadedPackages` (a map from package name to Package, used when
//       specifying particular dirs to test-packages)

var next_package_id = 1;
var Package = function () {
  var self = this;

  // Fields set by init_*:
  // name: package name, or null for an app pseudo-package or collection
  // source_root: base directory for resolving source files, null for collection
  // serve_root: base directory for serving files, null for collection

  // A unique ID (guaranteed to not be reused in this process -- if
  // the package is reloaded, it will get a different id the second
  // time)
  self.id = next_package_id++;

  // package metadata, from describe()
  self.metadata = {};

  self.on_use_handler = null;
  self.on_test_handler = null;
  self.npmDependencies = null;

  // registered source file handlers
  self.extensions = {};

  // Are we in the warehouse? (Set to true by initFromWarehouse.) Used to skip
  // npm re-scans.
  self.inWarehouse = false;

  // Files that define the structure of this package. Used by dependency
  // scanner.
  self.metadataFileHashes = {};

  // functions that can be called when the package is scanned --
  // visible as `Package` when package.js is executed
  self.packageFacade = {
    // keys
    // - summary: for 'meteor list'
    // - internal: if true, hide in list
    // - environments: optional
    //   (1) if present, if depended on in an environment not on this
    //       list, then throw an error
    //   (2) if present, these are also the environments that will be
    //       used when an application uses the package (since it can't
    //       specify environments.) if not present, apps will use
    //       [''], which is suitable for a package that doesn't care
    //       where it's loaded (like livedata.)
    describe: function (metadata) {
      _.extend(self.metadata, metadata);
    },

    on_use: function (f) {
      if (self.on_use_handler)
        throw new Error("A package may have only one on_use handler");
      self.on_use_handler = f;
    },

    on_test: function (f) {
      if (self.on_test_handler)
        throw new Error("A package may have only one on_test handler");
      self.on_test_handler = f;
    },

    register_extension: function (extension, callback) {
      if (_.has(self.extensions, extension))
        throw new Error("This package has already registered a handler for " +
                        extension);
      self.extensions[extension] = callback;
    },

    // Same as node's default `require` but is relative to the
    // package's directory. Regular `require` doesn't work well
    // because we read the package.js file and `runInThisContext` it
    // separately as a string.  This means that paths are relative to
    // the top-level meteor.js script rather than the location of
    // package.js
    _require: function(filename) {
      return require(path.join(self.source_root, filename));
    }
  };

  // npm functions that can be called when the package is scanned --
  // visible `Npm` when package.js is executed
  self.npmFacade = {
    depends: function (npmDependencies) {
      if (self.npmDependencies)
        throw new Error("Can only call `Npm.depends` once in package " + self.name + ".");
      if (typeof npmDependencies !== 'object')
        throw new Error("The argument to Npm.depends should look like: {gcd: '0.0.0'}");

      // don't allow npm fuzzy versions so that there is complete
      // consistency when deploying a meteor app
      //
      // XXX use something like seal or lockdown to have *complete* confidence
      // we're running the same code?
      meteorNpm.ensureOnlyExactVersions(npmDependencies);

      self.npmDependencies = npmDependencies;
    },

    require: function (name) {
      var nodeModuleDir = path.join(self.source_root, '.npm', 'node_modules', name);
      if (fs.existsSync(nodeModuleDir)) {
        return require(nodeModuleDir);
      } else {
        try {
          return require(name); // from the dev bundle
        } catch (e) {
          throw new Error("Can't find npm module '" + name + "'. Did you forget to call 'Npm.depends'?");
        }
      }
    }
  };

};

_.extend(Package.prototype, {
  // loads a package's package.js file into memory, using
  // runInThisContext. Wraps the contents of package.js in a closure,
  // supplying pseudo-globals 'Package' and 'Npm'.
  initFromPackageDir: function (name, dir) {
    var self = this;
    self.name = name;
    self.source_root = dir;
    self.serve_root = path.join(path.sep, 'packages', name);

    if (!fs.existsSync(self.source_root))
      throw new Error("The package named " + self.name + " does not exist.");

    // We use string concatenation to load package.js rather than
    // directly `require`ing it because that allows us to simplify the
    // package API (such as supporting Package.on_use rather than
    // something like Package.current().on_use)

    var fullpath = path.join(self.source_root, 'package.js');
    var code = fs.readFileSync(fullpath);
    self.metadataFileHashes[fullpath] = bundler.sha1(code);
    // \n is necessary in case final line is a //-comment
    var wrapped = "(function(Package,Npm){" + code.toString() + "\n})";
    // See #runInThisContext
    //
    // XXX it'd be nice to runInNewContext so that the package
    // setup code can't mess with our globals, but objects that
    // come out of runInNewContext have bizarro antimatter
    // prototype chains and break 'instanceof Array'. for now,
    // steer clear
    var func = require('vm').runInThisContext(wrapped, fullpath, true);
    func(self.packageFacade, self.npmFacade);
  },

  // Searches:
  // - APP/packages
  // - GITCHECKOUTOFMETEOR/packages
  // - $PACKAGE_DIRS (colon-separated)
  // @returns {Boolean} was the package found in any local package sets?
  initFromLocalPackages: function (name, packageSearchOptions) {
    var self = this;
    var packageDir = packages.directoryForLocalPackage(
      name, packageSearchOptions);
    if (packageDir) {
      self.initFromPackageDir(name, packageDir);
      return true;
    } else {
      return false;
    }
  },

  initFromWarehouse: function (name, version) {
    var self = this;
    self.initFromPackageDir(
      name,
      path.join(warehouse.getWarehouseDir(), 'packages', name, version));
    self.inWarehouse = true;
  },

  init_from_app_dir: function (app_dir, ignore_files) {
    var self = this;
    self.name = null;
    self.source_root = app_dir;
    self.serve_root = path.sep;

    var sources_except = function (api, except, tests) {
      var allSources = self._scan_for_sources(api, ignore_files || []);
      var withoutAppPackages = _.reject(allSources, function (sourcePath) {
        // Skip files that are in app packages. (Directories named "packages"
        // lower in the tree are OK.)
        return sourcePath.match(/^packages\//);
      });
      var withoutExceptDir = _.reject(withoutAppPackages, function (source_path) {
        return (path.sep + source_path + path.sep).indexOf(path.sep + except + path.sep) !== -1;
      });
      return _.filter(withoutExceptDir, function (source_path) {
        var is_test = ((path.sep + source_path + path.sep).indexOf(path.sep + 'tests' + path.sep) !== -1);
        return is_test === (!!tests);
      });
    };

    self.packageFacade.on_use(function (api) {
      // -- Packages --

      // standard client packages (for now), for the classic meteor
      // stack -- has to come before user packages, because we don't
      // (presently) require packages to declare dependencies on
      // 'standard meteor stuff' like minimongo.
      api.use(['deps', 'session', 'livedata', 'mongo-livedata', 'spark',
               'templating', 'startup', 'past']);
      // XXX this read has a race with the actual read that is used
      var packagesFile = path.join(app_dir, '.meteor', 'packages');
      self.metadataFileHashes[packagesFile] =
        bundler.sha1(fs.readFileSync(packagesFile));
      api.use(project.get_packages(app_dir));

      // -- Source files --
      api.add_files(sources_except(api, "server"), "client");
      api.add_files(sources_except(api, "client"), "server");
    });

    self.packageFacade.on_test(function (api) {
      api.use(self);
      api.add_files(sources_except(api, "server", true), "client");
      api.add_files(sources_except(api, "client", true), "server");
    });
  },

  // Find all files under this.source_root that have an extension we
  // recognize, and return them as a list of paths relative to
  // source_root. Ignore files that match a regexp in the ignore_files
  // array, if given. As a special case (ugh), push all html files to
  // the head of the list.
  _scan_for_sources: function (api, ignore_files) {
    var self = this;

    // find everything in tree, sorted depth-first alphabetically.
    var file_list = files.file_list_sync(self.source_root,
                                         api.registered_extensions());
    file_list = _.reject(file_list, function (file) {
      return _.any(ignore_files || [], function (pattern) {
        return file.match(pattern);
      });
    });
    file_list.sort(files.sort);

    // XXX HUGE HACK --
    // push html (template) files ahead of everything else. this is
    // important because the user wants to be able to say
    // Template.foo.events = { ... }
    //
    // maybe all of the templates should go in one file? packages
    // should probably have a way to request this treatment (load
    // order depedency tags?) .. who knows.
    var htmls = [];
    _.each(file_list, function (filename) {
      if (path.extname(filename) === '.html') {
        htmls.push(filename);
        file_list = _.reject(file_list, function (f) { return f === filename;});
      }
    });
    file_list = htmls.concat(file_list);

    // now make everything relative to source_root
    var prefix = self.source_root;
    if (prefix[prefix.length - 1] !== path.sep)
      prefix += path.sep;

    return file_list.map(function (abs) {
      if (path.relative(prefix, abs).match(/\.\./))
        // XXX audit to make sure it works in all possible symlink
        // scenarios
        throw new Error("internal error: source file outside of parent?");
      return abs.substr(prefix.length);
    });
  },

  // Called when this package wants to ensure certain npm dependencies
  // are installed for use within server code.
  //
  // @param npmDependencies {Object} eg {gcd: "0.0.0", tar: "0.1.14"}
  installNpmDependencies: function(quiet) {
    if (this.npmDependencies) {
      // go through a specialized npm dependencies update process, ensuring we
      // don't get new versions of any (sub)dependencies. this process also runs
      // mostly safely multiple times in parallel (which could happen if you
      // have two apps running locally using the same package)
      meteorNpm.updateDependencies(
        this.name, this.npmDir(),
        this.npmDependencies, quiet, this.inWarehouse);
    }
  },

  npmDir: function () {
    return path.join(this.source_root, '.npm');
  }
});

var loadedPackages = {};

var packages = exports;
_.extend(exports, {

  // get a package by name. also maps package objects to themselves.
  // load order is:
  // - APP_DIR/packages
  // - PACKAGE_DIRS
  // - METEOR_DIR/packages (if in a git checkout)
  // - warehouse
  get: function (name, packageSearchOptions) {
    var self = this;
    packageSearchOptions = packageSearchOptions || {};
    if (name instanceof Package)
      return name;
    if (!(name in loadedPackages)) {
      if (packageSearchOptions.preloadedPackages &&
          name in packageSearchOptions.preloadedPackages) {
        loadedPackages[name] = packageSearchOptions.preloadedPackages[name];
      } else {
        var pkg = new Package;
        if (pkg.initFromLocalPackages(name, packageSearchOptions)) {
          loadedPackages[name] = pkg;
        } else if (packageSearchOptions.releaseManifest) {
          pkg.initFromWarehouse(
            name, packageSearchOptions.releaseManifest.packages[name]);
          loadedPackages[name] = pkg;
        }
      }
    }

    return loadedPackages[name];
  },

  // load a package directly from a directory. don't cache.
  loadFromDir: function(name, packageDir) {
    var pkg = new Package;
    pkg.initFromPackageDir(name, packageDir);
    return pkg;
  },

  // get a package that represents an app. (ignore_files is optional
  // and if given, it should be an array of regexps for filenames to
  // ignore when scanning for source files.)
  get_for_app: function (app_dir, ignore_files) {
    var pkg = new Package;
    pkg.init_from_app_dir(app_dir, ignore_files || []);
    return pkg;
  },

  // force reload of all packages
  flush: function () {
    loadedPackages = {};
  },

  // get all packages available. options are appDir and releaseManifest.
  //
  // returns {Object} maps name to Package
  list: function (packageSearchOptions) {
    var self = this;
    packageSearchOptions = packageSearchOptions || {};
    var list = {};

    _.each(packages._localPackageDirs(packageSearchOptions), function (dir) {
      _.each(fs.readdirSync(dir), function (name) {
        if (files.is_package_dir(path.join(dir, name))) {
          if (!list[name]) // earlier directories get precedent
            list[name] = packages.get(name, packageSearchOptions);
        }
      });
    });

    if (packageSearchOptions.releaseManifest) {
      _.each(packageSearchOptions.releaseManifest.packages, function(version, name) {
        // don't even look for packages if they've already been
        // overridden (though this `if` isn't necessary for
        // correctness, since `packages.get` looks for packages in the
        // override directories first anyways)
        if (!list[name])
          list[name] = packages.get(name, packageSearchOptions);
      });
    }

    return list;
  },

  // returns a pretty list suitable for showing to the user. input is
  // a list of package objects, each of which must have a name (not be
  // an application package.)
  format_list: function (pkgs) {
    var longest = '';
    _.each(pkgs, function (pkg) {
      if (pkg.name.length > longest.length)
        longest = pkg.name;
    });
    var pad = longest.replace(/./g, ' ');
    // it'd be nice to read the actual terminal width, but I tried
    // several methods and none of them work (COLUMNS isn't set in
    // node's environment; `tput cols` returns a constant 80.) maybe
    // node is doing something weird with ptys.
    var width = 80;

    var out = '';
    _.each(pkgs, function (pkg) {
      if (pkg.metadata.internal)
        return;
      var name = pkg.name + pad.substr(pkg.name.length);
      var summary = pkg.metadata.summary || 'No description';
      out += (name + "  " +
              summary.substr(0, width - 2 - pad.length) + "\n");
    });

    return out;
  },

  // for a package that exists in localPackageDirs, find the directory
  // in which it exists.
  // XXX does this need to be absolute?
  directoryForLocalPackage: function (name, packageSearchOptions) {
    // Make sure that if we're using meteor test-packages to test a package in a
    // random spot, that we watch it for dependencies.
    if (packageSearchOptions && packageSearchOptions.preloadedPackages &&
        name in packageSearchOptions.preloadedPackages) {
      return packageSearchOptions.preloadedPackages[name].source_root;
    }

    var searchDirs = packages._localPackageDirs(packageSearchOptions);
    for (var i = 0; i < searchDirs.length; ++i) {
      var packageDir = path.join(searchDirs[i], name);
      if (fs.existsSync(path.join(packageDir, 'package.js')))
        return packageDir;
    }
    return undefined;
  },

  _localPackageDirs: function (packageSearchOptions) {
    var packageDirs = [];
    packageSearchOptions = packageSearchOptions || {};

    // If we're running from an app (as opposed to a global-level "meteor
    // test-packages"), use app packages.
    if (packageSearchOptions.appDir)
      packageDirs.push(path.join(packageSearchOptions.appDir, 'packages'));

    // Next, search $PACKAGE_DIRS.
    if (process.env.PACKAGE_DIRS)
      packageDirs.push.apply(packageDirs, process.env.PACKAGE_DIRS.split(':'));

    // If we're running out of a git checkout of meteor, use the packages from
    // the git tree.
    if (!files.usesWarehouse())
      packageDirs.push(path.join(files.getCurrentToolsDir(), 'packages'));

    // Only return directories that exist.
    return _.filter(packageDirs, function (dir) {
      try {
        // use stat rather than lstat since symlink to dir is OK
        var stats = fs.statSync(dir);
      } catch (e) {
        return false;
      }
      return stats.isDirectory();
    });
  }
});
