// Bundle contents:
// main.js [run to start the server]
// /static [served by node for now]
// /static_cacheable [cache-forever files, served by node for now]
// /server [XXX split out into a package]
//   server.js, .... [contents of tools/server]
//   node_modules [for now, contents of (dev_bundle)/lib/node_modules]
// /app.html
// /app [user code]
// /app.json: [data for server.js]
//  - load [list of files to load, relative to root, presumably under /app]
//  - manifest [list of resources in load order, each consists of an object]:
//     {
//       "path": relative path of file in the bundle, normalized to use forward slashes
//       "where": "client", "internal"  [could also be "server" in future]
//       "type": "js", "css", or "static"
//       "cacheable": (client) boolean, is it safe to ask the browser to cache this file
//       "url": (client) relative url to download the resource, includes cache
//              busting param if used
//       "size": size in bytes
//       "hash": sha1 hash of the contents
//     }
// /dependencies.json: files to monitor for changes in development mode
//  - extensions [list of extensions registered for user code, with dots]
//  - packages [map from package name to list of paths relative to the package]
//  - core [paths relative to 'app' in meteor tree]
//  - app [paths relative to top of app tree]
//  - exclude [list of regexps for files to ignore (everywhere)]
//  (for 'core' and 'apps', if a directory is given, you should
//  monitor everything in the subtree under it minus the stuff that
//  matches exclude, and if it doesn't exist yet, you should watch for
//  it to appear)
//
// The application launcher is expected to execute /main.js with node, setting
// various environment variables (such as PORT and MONGO_URL). The enclosed node
// application is expected to do the rest, including serving /static.

var path = require('path');
var files = require(path.join(__dirname, 'files.js'));
var packages = require(path.join(__dirname, 'packages.js'));
var linker = require(path.join(__dirname, 'linker.js'));
var warehouse = require(path.join(__dirname, 'warehouse.js'));
var crypto = require('crypto');
var fs = require('fs');
var uglify = require('uglify-js');
var cleanCSS = require('clean-css');
var _ = require('underscore');
var project = require(path.join(__dirname, 'project.js'));

// files to ignore when bundling. node has no globs, so use regexps
var ignore_files = [
    /~$/, /^\.#/, /^#.*#$/,
    /^\.DS_Store$/, /^ehthumbs\.db$/, /^Icon.$/, /^Thumbs\.db$/,
    /^\.meteor$/, /* avoids scanning N^2 files when bundling all packages */
    /^\.git$/ /* often has too many files to watch */
];

var sha1 = exports.sha1 = function (contents) {
  var hash = crypto.createHash('sha1');
  hash.update(contents);
  return hash.digest('hex');
};


///////////////////////////////////////////////////////////////////////////////
// Slice
///////////////////////////////////////////////////////////////////////////////

// Holds the resources that a package is contributing to a bundle, for
// a particular role ('use' or 'test') and a particular where
// ('client' or 'server').
var Slice = function (pkg, role, where) {
  var self = this;
  self.pkg = pkg;

  // "use" in the normal case (this object represents the instance of
  // a package in a bundle), or "test" if this instead represents an
  // instance of the package's tests.
  self.role = role;

  // "client" or "server"
  self.where = where;
};

///////////////////////////////////////////////////////////////////////////////
// Bundle
///////////////////////////////////////////////////////////////////////////////

// options to include:
//
// - releaseStamp: the Meteor release name to write into the bundle metadata
// - library: tells you how to find packages
var Bundle = function (options) {
  var self = this;

  // All of the Slices that are to go into this bundle, in the order
  // that they are to be loaded.
  self.slices = [];

  // meteor release version
  self.releaseStamp = options.releaseStamp;

  // search configuration for package.get()
  self.library = options.library;

  // map from environment, to list of filenames
  self.js = {client: [], server: []};

  // list of filenames
  self.css = [];

  // images and other static files added from packages
  // map from environment, to list of filenames
  self.static = {client: [], server: []};

  // Map from environment, to path name (server relative), to contents
  // of file as buffer.
  self.files = {client: {}, client_cacheable: {}, server: {}};

  // See description of the manifest at the top.
  // Note that in contrast to self.js etc., the manifest only includes
  // files which are in the final bundler output: for example, if code
  // is minified, the manifest includes the minify output file but not
  // the individual input files that were combined.
  self.manifest = [];

  // these directories are copied (cp -r) or symlinked into the
  // bundle. maps target path (server relative) to source directory on
  // disk
  self.nodeModulesDirs = {};

  // list of segments of additional HTML for <head>/<body>
  self.head = [];
  self.body = [];

  // list of errors encountered while bundling. array of string.
  self.errors = [];
};

_.extend(Bundle.prototype, {
  // Determine the packages to load, create Slices for
  // them, put them in load order, save in slices.
  //
  // contents is a map from role ('use' or 'test') to environment
  // ('client' or 'server') to an array of either package names or
  // actual Package objects.
  determineLoadOrder: function (contents) {
    var self = this;

    // Package slices being used. Map from a role string (eg, "use" or
    // "test") to "client" or "server" to a package id to a Slice.
    var sliceIndex = {use: {client: {}, server: {}},
                    test: {client: {}, server: {}}};
    var slicesUnordered = [];

    // Ensure that slices exist for a package and its dependencies.
    var add = function (pkg, role, where) {
      if (sliceIndex[role][where][pkg.id])
        return;
      var slice = new Slice(pkg, role, where);
      sliceIndex[role][where][pkg.id] = slice;
      slicesUnordered.push(slice);
      _.each(pkg.uses[role][where], function (usedPkgName) {
        var usedPkg = self.getPackage(usedPkgName);
        add(usedPkg, "use", where);
      });
    };

    // Add the provided roots and all of their dependencies.
    _.each(contents, function (whereToArray, role) {
      _.each(whereToArray, function (packageList, where) {
        _.each(packageList, function (packageOrPackageName) {
          var pkg = self.getPackage(packageOrPackageName);
          add(pkg, role, where);
        });
      });
    });

    // Take unorderedSlices as input, put it in order, and save it to
    // self.slices. "In order" means that if X depends on (uses) Y,
    // and that relationship is not marked as unordered, Y appears
    // before X in the ordering. Raises an exception iff there is no
    // such ordering (due to circular dependency.)
    var id = function (slice) {
      return slice.role + ":" + slice.where + ":" + slice.pkg.id;
    };

    var done = {};
    var remaining = {};
    var onStack = {};
    _.each(slicesUnordered, function (slice) {
      remaining[id(slice)] = slice;
    });

    while (true) {
      // Get an arbitrary package from those that remain, or break if
      // none remain
      var first = undefined;
      for (first in remaining)
        break;
      if (first === undefined)
        break;
      first = remaining[first];

      // Emit that package and all of its dependencies
      var load = function (slice) {
        if (done[id(slice)])
          return;

        _.each(slice.pkg.uses[slice.role][slice.where], function (usedPkgName) {
          if (slice.pkg.name && slice.pkg.unordered[usedPkgName])
            return;
          var usedPkg = self.getPackage(usedPkgName);
          var usedSlice = sliceIndex.use[slice.where][usedPkg.id];
          if (! usedSlice)
            throw new Error("Missing slice?");
          if (onStack[id(usedSlice)]) {
            console.error("fatal: circular dependency between packages " +
                          slice.pkg.name + " and " + usedSlice.pkg.name);
            process.exit(1);
          }
          onStack[id(usedSlice)] = true;
          load(usedSlice);
          delete onStack[id(usedSlice)];
        });
        self.slices.push(slice);
        done[id(slice)] = true;
        delete remaining[id(slice)];
      };
      load(first);
    }
  },

  prepNodeModules: function () {
    var self = this;
    var seen = {};
    _.each(self.slices, function (slice) {
      // Bring npm dependencies up to date. One day this will probably
      // grow into a full-fledged package build step.
      if (slice.pkg.npmDependencies && ! seen[slice.pkg.id]) {
        seen[slice.pkg.id] = true;
        slice.pkg.installNpmDependencies();
        self.bundleNodeModules(slice.pkg);
      }
    });
  },

  getPackage: function (packageOrPackageName) {
    var self = this;
    var pkg = self.library.get(packageOrPackageName);
    if (! pkg) {
      console.error("Package not found: " + packageOrPackageName);
      process.exit(1);
    }
    return pkg;
  },

  // map a package's generated node_modules directory to the package
  // directory within the bundle
  bundleNodeModules: function (pkg) {
    var nodeModulesPath = path.join(pkg.npmDir(), 'node_modules');
    this.nodeModulesDirs[pkg.name] = nodeModulesPath;
  },

  // Sort the packages in dependency order, then, package by package,
  // write their resources into the bundle (which includes running the
  // JavaScript linker.)
  emitResources: function () {
    var self = this;

    // Copy their resources into the bundle in order
    _.each(self.slices, function (slice) {
      // ** Get the final resource list. It's the static resources
      // ** from the package plus the output of running the JavaScript
      // ** linker.

      slice.pkg.ensureCompiled();
      var resources = _.clone(slice.pkg.resources[slice.role][slice.where]);

      var isApp = ! slice.pkg.name;
      // Compute imports by merging the exports of all of the
      // packages we use. To be eligible to supply an import, a
      // slice must presently (a) be named (the app can't supply
      // exports, at least for now); (b) have the "use" role (you
      // can't import symbols from tests and such, primarily
      // because we don't have a good way to name non-"use" roles
      // in JavaScript.) Note that in the case of conflicting
      // symbols, later packages get precedence.
      var imports = {}; // map from symbol to supplying package name
      _.each(_.values(slice.pkg.uses[slice.role][slice.where]), function (otherPkgName){
        var otherPkg = self.getPackage(otherPkgName);
        if (otherPkg.name && ! slice.pkg.unordered[otherPkg.name]) {
          // make sure otherPkg.exports is valid
          otherPkg.ensureCompiled();
          _.each(otherPkg.exports.use[slice.where], function (symbol) {
            imports[symbol] = otherPkg.name;
          });
        }
      });

      // Phase 2 link
      var files = linker.link({
        imports: imports,
        useGlobalNamespace: isApp,
        prelinkFiles: slice.pkg.prelinkFiles[slice.role][slice.where],
        boundary: slice.pkg.boundary[slice.role][slice.where]
      });

      // Add each output as a resource
      _.each(files, function (file) {
        resources.push({
          type: "js",
          data: new Buffer(file.source, 'utf8'),
          servePath: file.servePath
        });
      });

      // ** Emit the resources
      _.each(resources, function (resource) {
        if (resource.type === "js") {
          self.files[slice.where][resource.servePath] = resource.data;
          self.js[slice.where].push(resource.servePath);
        } else if (resource.type === "css") {
          if (slice.where !== "client")
            // XXX might be nice to throw an error here, but then we'd
            // have to make it so that packages.js ignores css files
            // that appear in the server directories in an app tree

            // XXX XXX can't we easily do that in the css handler in
            // meteor.js?
            return;

          self.files[slice.where][resource.servePath] = resource.data;
          self.css.push(resource.servePath);
        } else if (resource.type === "static") {
          self.files[slice.where][resource.servePath] = resource.data;
          self.static[slice.where].push(resource.servePath);
        } else if (resource.type === "head" || resource.type === "body") {
          if (slice.where !== "client")
            throw new Error("HTML segments can only go to the client");
          self[resource.type].push(resource.data);
        } else {
          throw new Error("Unknown type " + resource.type);
        }
      });
    });
  },

  // Minify the bundle
  minify: function () {
    var self = this;

    var addFile = function (type, finalCode) {
      var contents = new Buffer(finalCode);
      var hash = sha1(contents);
      var name = '/' + hash + '.' + type;
      self.files.client_cacheable[name] = contents;
      self.manifest.push({
        path: 'static_cacheable' + name,
        where: 'client',
        type: type,
        cacheable: true,
        url: name,
        size: contents.length,
        hash: hash
      });
    };

    /// Javascript
    var codeParts = [];
    _.each(self.js.client, function (js_path) {
      codeParts.push(self.files.client[js_path].toString('utf8'));

      delete self.files.client[js_path];
    });
    self.js.client = [];

    var combinedCode = codeParts.join('\n;\n');
    var finalCode = uglify.minify(
      combinedCode, {fromString: true, compress: {drop_debugger: false}}).code;

    addFile('js', finalCode);

    /// CSS
    var css_concat = "";
    _.each(self.css, function (css_path) {
      var css_data = self.files.client[css_path];
      css_concat = css_concat + "\n" +  css_data.toString('utf8');

      delete self.files.client[css_path];
    });
    self.css = [];

    var final_css = cleanCSS.process(css_concat);

    addFile('css', final_css);
  },

  _clientUrlsFor: function (type) {
    var self = this;
    return _.pluck(
      _.filter(self.manifest, function (resource) {
        return resource.where === 'client' && resource.type === type;
      }),
      'url'
    );
  },

  _generate_app_html: function () {
    var self = this;

    // XXX we don't do content-based dependency watching for this file
    var template = fs.readFileSync(path.join(__dirname, "app.html.in"));
    var f = require('handlebars').compile(template.toString());
    return f({
      scripts: self._clientUrlsFor('js'),
      head_extra: self.head.join('\n'),
      body_extra: self.body.join('\n'),
      stylesheets: self._clientUrlsFor('css')
    });
  },

  // The extensions registered by the application package, if
  // any. Kind of a hack.
  _app_extensions: function () {
    var self = this;
    var ret = [];

    _.each(self.slices, function (slice) {
      if (! slice.pkg.name) {
        var exts = slice.pkg.registeredExtensions(slice.role, slice.where);
        ret = _.union(ret, exts);
      }
    });

    return ret;
  },

  // nodeModulesMode should be "skip", "symlink", or "copy"
  write_to_directory: function (output_path, project_dir, nodeModulesMode) {
    var self = this;
    var app_json = {};
    var dependencies_json = {core: [], app: [], packages: {}, hashes: {}};
    var is_app = files.is_app_dir(project_dir);

    if (is_app) {
      dependencies_json.app.push(path.join('.meteor', 'packages'));
      dependencies_json.app.push(path.join('.meteor', 'release'));
    }

    // --- Set up build area ---

    // foo/bar => foo/.build.bar
    var build_path = path.join(path.dirname(output_path),
                               '.build.' + path.basename(output_path));

    // XXX cleaner error handling. don't make the humans read an
    // exception (and, make suitable for use in automated systems)
    files.rm_recursive(build_path);
    files.mkdir_p(build_path, 0755);

    // --- Core runner code ---

    files.cp_r(path.join(__dirname, 'server'),
               path.join(build_path, 'server'), {ignore: ignore_files});
    // XXX we don't do content-based dependency watching for these files
    dependencies_json.core.push('server');

    // --- Third party dependencies ---

    if (nodeModulesMode === "symlink")
      fs.symlinkSync(path.join(files.get_dev_bundle(), 'lib', 'node_modules'),
                     path.join(build_path, 'server', 'node_modules'));
    else if (nodeModulesMode === "copy")
      files.cp_r(path.join(files.get_dev_bundle(), 'lib', 'node_modules'),
                 path.join(build_path, 'server', 'node_modules'),
                 {ignore: ignore_files});
    else
      /* nodeModulesMode === "skip" */;

    fs.writeFileSync(
      path.join(build_path, 'server', '.bundle_version.txt'),
      fs.readFileSync(
        path.join(files.get_dev_bundle(), '.bundle_version.txt')));

    // --- Static assets ---

    var addClientFileToManifest = function (filepath, contents, type, cacheable, url, hash) {
      if (! contents instanceof Buffer)
        throw new Error('contents must be a Buffer');
      var normalized = filepath.split(path.sep).join('/');
      if (normalized.charAt(0) === '/')
        normalized = normalized.substr(1);
      self.manifest.push({
        // path is normalized to use forward slashes
        path: (cacheable ? 'static_cacheable' : 'static') + '/' + normalized,
        where: 'client',
        type: type,
        cacheable: cacheable,
        url: url || '/' + normalized,
        // contents is a Buffer and so correctly gives us the size in bytes
        size: contents.length,
        hash: hash || sha1(contents)
      });
    };

    if (is_app) {
      if (fs.existsSync(path.join(project_dir, 'public'))) {
        var copied =
          files.cp_r(path.join(project_dir, 'public'),
                     path.join(build_path, 'static'), {ignore: ignore_files});

        _.each(copied, function (fs_relative_path) {
          var filepath = path.join(build_path, 'static', fs_relative_path);
          var contents = fs.readFileSync(filepath);
          var hash = sha1(contents);
          dependencies_json.hashes[
            path.join(project_dir, 'public', fs_relative_path)] = hash;
          addClientFileToManifest(fs_relative_path, contents, 'static', false,
                                  undefined, hash);
        });
      }
      dependencies_json.app.push('public');
    }

    // Add cache busting query param if needed, and
    // add to manifest.
    var processClientCode = function (type, file) {
      var contents, url, hash;
      if (file in self.files.client_cacheable) {
        contents = self.files.client_cacheable[file];
        url = file;
      }
      else if (file in self.files.client) {
        // Client css and js becomes cacheable with the addition of the
        // cache busting query parameter.
        contents = self.files.client[file];
        delete self.files.client[file];
        self.files.client_cacheable[file] = contents;
        hash = sha1(contents);
        url = file + '?' + hash;
      }
      else
        throw new Error('unable to find file: ' + file);

      addClientFileToManifest(file, contents, type, true, url, hash);
    };

    _.each(self.js.client, function (file) { processClientCode('js',  file); });
    _.each(self.css,       function (file) { processClientCode('css', file); });

    // -- Client code --
    for (var rel_path in self.files.client) {
      var full_path = path.join(build_path, 'static', rel_path);
      files.mkdir_p(path.dirname(full_path), 0755);
      fs.writeFileSync(full_path, self.files.client[rel_path]);
      addClientFileToManifest(rel_path, self.files.client[rel_path], 'static', false);
    }

    // -- Client cache forever code --
    for (var rel_path in self.files.client_cacheable) {
      var full_path = path.join(build_path, 'static_cacheable', rel_path);
      files.mkdir_p(path.dirname(full_path), 0755);
      fs.writeFileSync(full_path, self.files.client_cacheable[rel_path]);
    }

    app_json.load = [];
    files.mkdir_p(path.join(build_path, 'app'), 0755);
    for (var rel_path in self.files.server) {
      var path_in_bundle = path.join('app', rel_path);
      var full_path = path.join(build_path, path_in_bundle);
      files.mkdir_p(path.dirname(full_path), 0755);
      fs.writeFileSync(full_path, self.files.server[rel_path]);
      app_json.load.push(path_in_bundle);
    }

    // `node_modules` directories for packages
    _.each(self.nodeModulesDirs, function (sourceNodeModulesDir, packageName) {
      files.mkdir_p(path.join(build_path, 'npm'));
      var buildModulesPath = path.join(build_path, 'npm', packageName);
      // XXX we should consider supporting bundle time-only npm dependencies
      // which don't need to be pushed to the server.
      if (nodeModulesMode === 'symlink') {
        // if we symlink the dev_bundle, also symlink individual package
        // node_modules.
        fs.symlinkSync(sourceNodeModulesDir, buildModulesPath);
      } else {
        // otherwise, copy them. if we're skipping the dev_bundle
        // modules (eg for deploy) we still need the per-package
        // modules.
        // XXX this breaks arch-specific modules. oh well.
        files.cp_r(sourceNodeModulesDir, buildModulesPath);
      }
    });

    var app_html = self._generate_app_html();
    fs.writeFileSync(path.join(build_path, 'app.html'), app_html);
    self.manifest.push({
      path: 'app.html',
      where: 'internal',
      hash: sha1(app_html)
    });
    dependencies_json.core.push(path.join('tools', 'app.html.in'));

    // --- Documentation, and running from the command line ---

    fs.writeFileSync(path.join(build_path, 'main.js'),
"require('./server/server.js');\n");

    fs.writeFileSync(path.join(build_path, 'README'),
"This is a Meteor application bundle. It has only one dependency,\n" +
"node.js (with the 'fibers' package). To run the application:\n" +
"\n" +
"  $ npm install fibers@1.0.0\n" +
"  $ export MONGO_URL='mongodb://user:password@host:port/databasename'\n" +
"  $ export ROOT_URL='http://example.com'\n" +
"  $ export MAIL_URL='smtp://user:password@mailhost:port/'\n" +
"  $ node main.js\n" +
"\n" +
"Use the PORT environment variable to set the port where the\n" +
"application will listen. The default is 80, but that will require\n" +
"root on most systems.\n" +
"\n" +
"Find out more about Meteor at meteor.com.\n");

    // --- Metadata ---

    app_json.manifest = self.manifest;

    dependencies_json.extensions = self._app_extensions();
    dependencies_json.exclude = _.pluck(ignore_files, 'source');
    dependencies_json.packages = {};
    _.each(_.values(self.slices), function (slice) {
      // Data for the mtime dependency watcher. We only record data here for
      // packages, not apps, since apps watch the whole directory for added
      // files.
      if (slice.pkg.name) {
        dependencies_json.packages[slice.pkg.name] = _.union(
          dependencies_json.packages[slice.pkg.name] || [],
          _.keys(slice.pkg.dependencyFileShas)
        );
      }
      // Data for the contents dependency watcher check.
      _.each(slice.pkg.dependencyFileShas, function (sha, relPath) {
        dependencies_json.hashes[
          path.join(slice.pkg.source_root, relPath)] = sha;
      });
    });

    if (self.releaseStamp && self.releaseStamp !== 'none')
      app_json.release = self.releaseStamp;

    fs.writeFileSync(path.join(build_path, 'app.json'),
                     JSON.stringify(app_json, null, 2));
    fs.writeFileSync(path.join(build_path, 'dependencies.json'),
                     JSON.stringify(dependencies_json, null, 2));

    // --- Move into place ---

    // XXX cleaner error handling (no exceptions)
    files.rm_recursive(output_path);
    fs.renameSync(build_path, output_path);
  }

});

///////////////////////////////////////////////////////////////////////////////
// Main
///////////////////////////////////////////////////////////////////////////////

/**
 * Take the Meteor app in project_dir, and compile it into a bundle at
 * output_path. output_path will be created if it doesn't exist (it
 * will be a directory), and removed if it does exist. The release
 * version is *not* read from the app's .meteor/release file. Instead,
 * it must be passed in as an option.
 *
 * Returns undefined on success. On failure, returns an array of
 * strings, the error messages. On failure, a bundle will still be
 * written to output_path. It is probably broken, but it is supposed
 * to contain correct dependency information, so you can tell when to
 * try bundling again.
 *
 * options include:
 * - minify : minify the CSS and JS assets
 *
 * - nodeModulesMode : decide on how to create the bundle's
 *   node_modules directory. one of:
 *     'skip' : don't create node_modules. used by `meteor deploy`, since
 *              our production servers already have all of the node modules
 *     'copy' : copy from a prebuilt local installation. used by
 *              `meteor bundle`
 *     'symlink' : symlink from a prebuild local installation. used
 *                 by `meteor run`
 *
 * - testPackages : array of package objects or package names whose
 *   tests should be included in this bundle
 *
 * - releaseStamp : The Meteor release version to use. This is *ONLY*
 *                  used as a stamp (eg Meteor.release). The package
 *                  search path is configured with 'library'.
 *
 * - library : Package library to use to fetch any required
 *   packages. NOTE: if there's an appDir here, it's used for package
 *   searching but it is NOT the appDir that we bundle!  So for
 *   "meteor test-packages" in an app, appDir is the test-runner-app
 *   but library.appDir is the app the user is in.
 */
exports.bundle = function (app_dir, output_path, options) {
  if (!options)
    throw new Error("Must pass options");
  if (!options.nodeModulesMode)
    throw new Error("Must pass options.nodeModulesMode");
  if (!options.library)
    throw new Error("Must pass options.library");
  if (!options.releaseStamp)
    throw new Error("Must pass options.releaseStamp or 'none'");

  var library = options.library;

  try {
    // Create a bundle and set up package search path
    library.flush(); // XXX why? maybe better to just create a new library?
    var bundle = new Bundle({
      releaseStamp: options.releaseStamp,
      library: library
    });

    // Create a Package object that represents the app
    var app = library.getForApp(app_dir, ignore_files);

    // Populate the list of slices to load
    bundle.determineLoadOrder({
      use: {client: [app], server: [app]},
      test: {client: options.testPackages || [],
             server: options.testPackages || []}
    });

    // Process npm modules
    bundle.prepNodeModules();

    // Link JavaScript, put resources in load order, and copy them to
    // the bundle
    bundle.emitResources();

    // Minify, if requested
    if (options.minify)
      bundle.minify();

    // Write to disk
    bundle.write_to_directory(output_path, app_dir, options.nodeModulesMode);

    if (bundle.errors.length)
      return bundle.errors;
  } catch (err) {
    return ["Exception while bundling application:\n" + (err.stack || err)];
  }
};
