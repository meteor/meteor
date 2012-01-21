var _ = require('./third/underscore.js');
var files = require('./files.js');
var fs = require('fs');
var path = require('path');

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
var Package = function () {
  var self = this;

  // Fields set by init_*:
  // name: package name, or null for an app pseudo-package
  // source_root: base directory for resolving source files
  // serve_root: base directory for serving files

  // package metadata, from describe()
  self.metadata = {};

  // high-level sources (map from environment to array), IN LOAD
  // ORDER. empty string means 'any environment this package is
  // included in'. each object is a path relative to source_root.
  self.sources = {'': [], client: [], server: []};

  // dependencies on other packages. map from environment (or empty
  // string, same deal as before) to package name to true. we have to
  // load these other packages before we can load our own files.
  self.depends = {'': {}, client: {}, server: {}};

  // registered source file handlers
  self.extensions = {};

  // functions that can be called when the package is scanned
  self.api = {
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

    depend: function (what) {
      if (typeof what !== "object" || (what instanceof Array))
        what = {'': what};

      for (var env in what) {
        var pkgs = what[env];
        if (!(pkgs instanceof Array))
          pkgs = [pkgs];
        _.each(pkgs, function (pkg) {
          self.depends[env][pkg] = true;
        });
      }
    },

    /**
     * This is the main API for adding source files to a package. They
     * will be processed with the register_extensions() handlers down
     * into bundle resources.
     *
     * Package.source(file1, file2, file3)
     * Package.source([file1, file2, file3])
     * Package.source({env1: [file1, file2, file3], env2: file4});
     *
     * If no environments given, defaults to "all environments
     * requested for this package" (added by package), or "package
     * default environment" (added by the app).
     *
     * Reload dependencies will be created on all referenced source
     * files. Currently this is the only way for a package to create
     * reload dependencies. (XXX we should really change that. Imagine
     * a packages that is some kind of preprocessor with something
     * like an #include directive.)
     */
    source: function (what) {
      if (typeof what !== "object" || (what instanceof Array))
        what = {'': what};

      for (var env in what) {
        var files = what[env];
        if (!(files instanceof Array))
          files = [files];
        _.each(files, function (file) {
          self.sources[env].push(file);
        });
      }
    },

    register_extension: function (extension, callback) {
      self.extensions[extension] = callback;
    }
  };
};

_.extend(Package.prototype, {
  init_from_library: function (name) {
    var self = this;
    self.name = name;
    self.source_root = path.join(__dirname, '../../packages', name);
    self.serve_root = path.join('/packages', name);

    if (name !== "core")
      self.depends[''].core = true;

    var fullpath = path.join(files.get_package_dir(), name, 'package.js');
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
    func(self.api, require);
  },

  init_from_app_dir: function (app_dir, ignore_files) {
    var self = this;
    self.name = null;
    self.source_root = app_dir;
    self.serve_root = '/';
    self.depends[''].core = true;

    // -- Packages --

    // standard client packages (for now), for the classic meteor
    // stack -- has to come before user packages, because we don't
    // (presently) require packages to declare dependencies on
    // 'standard meteor stuff' like minimongo.
    var used_packages = [
      'deps', 'session', 'livedata', 'liveui', 'templating', 'startup', 'past'
    ];
    used_packages =
      used_packages.concat(require('./project.js').get_packages(app_dir));

    _.each(used_packages, function (other_name) {
      // XXX should print a nice error if there's no such package
      // (this is where you'd get if you had a non-existent package in
      // .meteor/packages)
      var other_pkg = packages.get(other_name);
      var environments = other_pkg.metadata.environments;
      if (!environments)
        environments = [''];

      _.each(environments, function (env) {
        var d = {};
        d[env] = other_name;
        self.api.depend(d);
      });
    });

    // -- Source files --

    _.each(self._scan_for_sources(ignore_files || []), function (rel_path) {
      // XXX at some point we should re-work our directory structure and
      // how we determine which files are for the client and which are for
      // the server.
      var source_path = path.join(app_dir, rel_path);
      var is_client = (source_path.indexOf('/server/') === -1);
      var is_server = (source_path.indexOf('/client/') === -1);

      self.api.source({
        client: is_client ? rel_path : [],
        server: is_server ? rel_path : []
      });
    });
  },

  // Find all files under this.source_root that have an extension we
  // recognize, and return them as a list of paths relative to
  // source_root. Ignore files that match a regexp in the ignore_files
  // array, if given. As a special case (ugh), push all html files to
  // the head of the list.
  _scan_for_sources: function (ignore_files) {
    var self = this;

    // find everything in tree, sorted depth-first alphabetically.
    var file_list = files.file_list_sync(self.source_root,
                                         self.registered_extensions());
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
    if (prefix[prefix.length - 1] !== '/')
      prefix += '/';
    return file_list.map(function (abs) {
      if (prefix.length >= abs.length ||
          abs.substr(0, prefix.length) !== prefix)
        // XXX audit to make sure it works in all possible symlink
        // scenarios
        throw new Error("internal error: source file outside of parent?");
      return abs.substr(prefix.length);
    });
  },

  // Find the function that should be used to handle a source file
  // found in this package. We'll use handlers that are defined in
  // this package and in its immediate dependencies. ('extension'
  // should be the extension of the file without a leading dot.)
  get_sources_handler: function (extension) {
    var self = this;
    var candidates = []

    if (extension in self.extensions)
      candidates.push(self.extensions[extension]);

    for (var env in self.depends) {
      for (var other_name in self.depends[env]) {
        var other_pkg = packages.get(other_name);
        if (extension in other_pkg.extensions)
          candidates.push(other_pkg.extensions[extension]);
      }
    }

    // XXX do something more graceful than printing a stack trace and
    // exiting!! we have higher standards than that!

    if (!candidates.length)
      // A package included a source file that we don't have a
      // processor for. Wouldn't be app source, since we wouldn't have
      // added it as a source file in the first place.
      throw new Error("Don't know how to process file: " +
                      source.source_path);

    if (candidates.length > 1)
      // XXX improve error message (eg, name the packages involved)
      // and make it clear that it's not a global conflict, but just
      // among this package's dependencies
      throw new Error("Conflict: two packages are both trying " +
                      "to handle ." + extension);

    return candidates[0];
  },

  // Return a list of all of the extension that indicate source files
  // inside this package, INCLUDING leading dots.
  registered_extensions: function () {
    var self = this;
    var ret = _.keys(self.extensions);

    for (var env in self.depends)
      for (var other_name in self.depends[env])
        ret = _.union(ret, _.keys(packages.get(other_name).extensions));

    return _.map(ret, function (x) {return "." + x;});
  }
});

// in the future, this could be an on-disk cache that tracks mtimes.
var package_cache = {};

var packages = module.exports = {
  // get a package by name
  get: function (name) {
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

  // force reload of all packages
  flush: function () {
    package_cache = {};
  },

  // get all packages in the directory, in a map from package name to
  // a package object.
  list: function () {
    var ret = {};
    var dir = files.get_package_dir();
    _.each(fs.readdirSync(dir), function (name) {
      ret[name] = packages.get(name);
    });

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
