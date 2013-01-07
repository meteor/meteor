var path = require('path');
var _ = require('underscore');
var files = require(path.join(__dirname, 'files.js'));
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
//
// Or from a collection (a directory whose subdirs are packages):
//   var pkg = new Package;
//   pkg.init_from_collection(collection_dir);

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

  // registered source file handlers
  self.extensions = {};

  // functions that can be called when the package is scanned
  self.declarationFuncs = {
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
    }
  };
};

_.extend(Package.prototype, {
  init_from_library: function (name) {
    var self = this;
    self.name = name;
    self.source_root = files.get_package_dir(name);
    self.serve_root = path.join(path.sep, 'packages', name);

    if (!self.source_root)
      throw new Error("The package named " + self.name + " does not exist.");

    var fullpath = path.join(self.source_root, 'package.js');
    var code = fs.readFileSync(fullpath).toString();
    // \n is necessary in case final line is a //-comment
    var wrapped = "(function(Package,require){" + code + "\n})";
    // XXX it'd be nice to runInNewContext so that the package
    // setup code can't mess with our globals, but objects that
    // come out of runInNewContext have bizarro antimatter
    // prototype chains and break 'instanceof Array'. for now,
    // steer clear
    var func = require('vm').runInThisContext(wrapped, fullpath, true);
    // XXX would be nice to eliminate require. packages like
    // 'templating' use this to load other code to run at
    // bundle-time. and to pull in, eg, 'fs' and 'path' to access
    // the file system
    func(self.declarationFuncs, require);
  },

  init_from_app_dir: function (app_dir, ignore_files) {
    var self = this;
    self.name = null;
    self.source_root = app_dir;
    self.serve_root = path.sep;

    var sources_except = function (api, except, tests) {
      return _(self._scan_for_sources(api, ignore_files || []))
        .reject(function (source_path) {
          return (path.sep + source_path + path.sep).indexOf(path.sep + except + path.sep) !== -1;
        })
        .filter(function (source_path) {
          var is_test = ((path.sep + source_path + path.sep).indexOf(path.sep + 'tests' + path.sep) !== -1);
          return is_test === (!!tests);
        });
    };

    self.declarationFuncs.on_use(function (api) {
      // -- Packages --

      // standard client packages (for now), for the classic meteor
      // stack -- has to come before user packages, because we don't
      // (presently) require packages to declare dependencies on
      // 'standard meteor stuff' like minimongo.
      api.use(['deps', 'session', 'livedata', 'mongo-livedata', 'spark',
               'templating', 'startup', 'past']);
      api.use(require(path.join(__dirname, 'project.js')).get_packages(app_dir));

      // -- Source files --
      api.add_files(sources_except(api, "server"), "client");
      api.add_files(sources_except(api, "client"), "server");
    });

    self.declarationFuncs.on_test(function (api) {
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

  init_from_collection: function (collection_dir) {
    var self = this;
    self.name = null;
    self.source_root = null;
    self.serve_root = null;

    self.declarationFuncs.on_test(function (api) {
      _.each(fs.readdirSync(collection_dir), function (name) {
        // only take things that are actually packages
        if (files.is_package_dir(path.join(collection_dir, name)))
          api.include_tests(name);
      });
    });
  }
});

// in the future, this could be an on-disk cache that tracks mtimes.
var package_cache = {};

var packages = module.exports = {
  // get a package by name. also maps package objects to themselves.
  get: function (name) {
    if (name instanceof Package)
      return name;
    if (!(name in package_cache)) {
      var pkg = new Package;
      pkg.init_from_library(name);
      package_cache[name] = pkg;
    }

    return package_cache[name];
  },

  // get a package that represents an app. (ignore_files is optional
  // and if given, it should be an array of regexps for filenames to
  // ignore when scanning for source files.)
  get_for_app: function (app_dir, ignore_files) {
    var pkg = new Package;
    pkg.init_from_app_dir(app_dir, ignore_files || []);
    return pkg;
  },

  get_for_collection: function (collection_dir) {
    var pkg = new Package;
    pkg.init_from_collection(collection_dir);
    return pkg;
  },

  // get a package that represents a particular directory on disk,
  // which might be an app, a package, or even a collection of
  // packages.
  get_for_dir: function (project_dir) {
    if (files.is_app_dir(project_dir))
      return packages.get_for_app(project_dir);
    else if (files.is_package_dir(project_dir))
      // this will need to change when packages are stored in more
      // than one place
      return packages.get(path.basename(project_dir));
    else if (files.is_package_collection_dir(project_dir))
      return packages.get_for_collection(project_dir);
    else
      throw new Error("Unknown project directory type");
  },

  // force reload of all packages
  flush: function () {
    package_cache = {};
  },

  // get all packages in the directory, in a map from package name to
  // a package object.
  list: function () {
    var ret = {};

    _.each(files.get_package_dirs(), function(dir) {
      _.each(fs.readdirSync(dir), function (name) {
        // skip .meteor directory
        if (fs.existsSync(path.join(dir, name, 'package.js')))
          ret[name] = packages.get(name);
      });
    })

    return ret;
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
  }
}
