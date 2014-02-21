// == Site Archive (*.star) file layout (subject to rapid change) ==
//
// /star.json
//
//  - format: "site-archive-pre1" for this version
//
//  - builtBy: human readable banner (eg, "Meteor 0.6.0")
//
//  - programs: array of programs in the star, each an object:
//    - name: short, unique name for program, for referring to it
//      programmatically
//    - arch: architecture that this program targets. Something like
//            "os", "os.linux.x86_64", or "browser.w3c".
//    - path: directory (relative to star.json) containing this program
//
//    XXX in the future this will also contain instructions for
//    mounting packages into the namespace of each program, and
//    possibly for mounting programs on top of each other (this would
//    be the principled mechanism by which a server program could read
//    a client program so it can server it)
//
//  - plugins: array of plugins in the star, each an object:
//    - name: short, unique name for plugin, for referring to it
//      programmatically
//    - arch: typically 'os' (for a portable plugin) or eg
//      'os.linux.x86_64' for one that include native node_modules
//    - path: path (relative to star.json) to the control file (eg,
//      program.json) for this plugin
//
// - meteorRelease: the value used in Meteor.release for programs inside the
//     star, or "none"
//
// /README: human readable instructions
//
// /main.js: script that can be run in node.js to start the site
//   running in standalone mode (after setting appropriate environment
//   variables as documented in README)
//
// /server/.bundle_version.txt: contains the dev_bundle version that
//   legacy (read: current) Galaxy version read in order to set
//   NODE_PATH to point to arch-specific builds of binary node modules
//   (primarily this is for node-fibers)
//
// XXX in the future one program (which must be a server-type
// architecture) will be designated as the 'init' program. The
// container will call it with arguments to signal app lifecycle
// events like 'start' and 'stop'.
//
//
// Conventionally programs will be located at /programs/<name>, but
// really the build tool can lay out the star however it wants.
//
//
// == Format of a program when arch is "browser.*" ==
//
// Standard:
//
// /program.json
//
//  - format: "browser-program-pre1" for this version
//
//  - page: path to the template for the HTML to serve when a browser
//    loads a page that is part of the application. In the file,
//    some strings of the format ##FOO## will be replaced with
//    appropriate values at runtime by the webapp package.
//
//  - manifest: array of resources to serve with HTTP, each an object:
//    - path: path of file relative to program.json
//    - where: "client"
//    - type: "js", "css", or "asset"
//    - cacheable: is it safe to ask the browser to cache this file (boolean)
//    - url: relative url to download the resource, includes cache busting
//        parameter when used
//    - size: size of file in bytes
//    - hash: sha1 hash of the file contents
//    - sourceMap: optional path to source map file (relative to program.json)
//    Additionally there will be an entry with where equal to
//    "internal", path equal to page (above), and hash equal to the
//    sha1 of page (before replacements). Currently this is used to
//    trigger HTML5 appcache reloads at the right time (if the
//    'appcache' package is being used).
//
// Convention:
//
// page is 'app.html'.
//
//
// == Format of a program when arch is "os.*" ==
//
// Standard:
//
// /server.js: script to run inside node.js to start the program
//
// XXX Subject to change! This will likely change to a shell script
// (allowing us to represent types of programs that don't use or
// depend on node) -- or in fact, rather than have anything fixed here
// at all, star.json just contains a path to a program to run, which
// can be anything than can be exec()'d.
//
// Convention:
//
// /program.json:
//
//  - load: array with each item describing a JS file to load at startup:
//    - path: path of file, relative to program.json
//    - node_modules: if Npm.require is called from this file, this is
//      the path (relative to program.json) of the directory that should
//      be search for npm modules
//    - assets: map from path (the argument to Assets.getText and
//      Assets.getBinary) to path on disk (relative to program.json)
//      of the asset
//    - sourceMap: if present, path of a file that contains a source
//      map for this file, relative to program.json
//
// /config.json:
//
//  - client: the client program that should be served up by HTTP,
//    expressed as a path (relative to program.json) to the *client's*
//    program.json.
//
//  - meteorRelease: the value to use for Meteor.release, if any
//
//
// /app/*: source code of the (server part of the) app
// /packages/foo.js: the (linked) source code for package foo
// /package-tests/foo.js: the (linked) source code for foo's tests
// /npm/foo/bar: node_modules for slice bar of package foo. may be
// symlinked if developing locally.
//
// /node_modules: node_modules needed for server.js. omitted if
// deploying (see .bundle_version.txt above), copied if bundling,
// symlinked if developing locally.
//
//
// == Format of a program that is to be used as a plugin ==
//
// /program.json:
//  - format: "javascript-image-pre1" for this version
//  - arch: the architecture that this build requires
//  - load: array with each item describing a JS file to load, in load order:
//    - path: path of file, relative to program.json
//    - node_modules: if Npm.require is called from this file, this is
//      the path (relative to program.json) of the directory that should
//      be search for npm modules
//
// It's a little odd that architecture is stored twice (in both the
// top-level star control file and in the plugin control file) but
// it's fine and it's probably actually cleaner, because it means that
// the plugin can be treated as a self-contained unit.
//
// Note that while the spec for "os.*" is going to change to
// represent an arbitrary POSIX (or Windows) process rather than
// assuming a nodejs host, these plugins will always refer to
// JavaScript code (that potentially might be a plugin to be loaded
// into an existing JS VM). But this seems to be a concern that is
// somewhat orthogonal to arch (these plugins can still use packages
// of arch "os.*"). There is probably a missing abstraction here
// somewhere (decoupling target type from architecture) but it can
// wait until later.

var path = require('path');
var util = require('util');
var files = require(path.join(__dirname, 'files.js'));
var packages = require(path.join(__dirname, 'packages.js'));
var Builder = require(path.join(__dirname, 'builder.js'));
var archinfo = require(path.join(__dirname, 'archinfo.js'));
var buildmessage = require('./buildmessage.js');
var fs = require('fs');
var _ = require('underscore');
var project = require(path.join(__dirname, 'project.js'));
var builder = require(path.join(__dirname, 'builder.js'));
var unipackage = require(path.join(__dirname, 'unipackage.js'));
var watch = require('./watch.js');
var release = require('./release.js');
var Fiber = require('fibers');
var Future = require(path.join('fibers', 'future'));
var sourcemap = require('source-map');
var runLog = require('./run-log.js').runLog;


// files to ignore when bundling. node has no globs, so use regexps
var ignoreFiles = [
    /~$/, /^\.#/, /^#.*#$/,
    /^\.DS_Store\/?$/, /^ehthumbs\.db$/, /^Icon.$/, /^Thumbs\.db$/,
    /^\.meteor\/$/, /* avoids scanning N^2 files when bundling all packages */
    /^\.git\/$/ /* often has too many files to watch */
];

// http://davidshariff.com/blog/javascript-inheritance-patterns/
var inherits = function (child, parent) {
  var tmp = function () {};
  tmp.prototype = parent.prototype;
  child.prototype = new tmp;
  child.prototype.constructor = child;
};

var rejectBadPath = function (p) {
  if (p.match(/\.\./))
    throw new Error("bad path: " + p);
};

var stripLeadingSlash = function (p) {
  if (p.charAt(0) !== '/')
    throw new Error("bad path: " + p);
  return p.slice(1);
};


// Contents of main.js in bundles. Exported for use by the bundler
// tests.
exports._mainJsContents = "process.argv.splice(2, 0, 'program.json');\nprocess.chdir(require('path').join(__dirname, 'programs', 'server'));\nrequire('./programs/server/boot.js');\n";

///////////////////////////////////////////////////////////////////////////////
// NodeModulesDirectory
///////////////////////////////////////////////////////////////////////////////

// Represents a node_modules directory that we need to copy into the
// bundle or otherwise make available at runtime.
var NodeModulesDirectory = function (options) {
  var self = this;

  // The absolute path (on local disk) to a directory that contains
  // the built node_modules to use.
  self.sourcePath = options.sourcePath;

  // The path (relative to the bundle root) where we would preferably
  // like the node_modules to be output (essentially cosmetic).
  self.preferredBundlePath = options.preferredBundlePath;
};

///////////////////////////////////////////////////////////////////////////////
// File
///////////////////////////////////////////////////////////////////////////////

// Allowed options:
// - sourcePath: path to file on disk that will provide our contents
// - data: contents of the file as a Buffer
// - hash: optional, sha1 hash of the file contents, if known
// - sourceMap: if 'data' is given, can be given instead of sourcePath. a string
// - cacheable
var File = function (options) {
  var self = this;

  if (options.data && ! (options.data instanceof Buffer))
    throw new Error('File contents must be provided as a Buffer');
  if (! options.sourcePath && ! options.data)
    throw new Error("Must provide either sourcePath or data");

  // The absolute path in the filesystem from which we loaded (or will
  // load) this file (null if the file does not correspond to one on
  // disk).
  self.sourcePath = options.sourcePath;

  // If this file was generated, a sourceMap (as a string) with debugging
  // information, as well as the "root" that paths in it should be resolved
  // against. Set with setSourceMap.
  self.sourceMap = null;
  self.sourceMapRoot = null;

  // Where this file is intended to reside within the target's
  // filesystem.
  self.targetPath = null;

  // The URL at which this file is intended to be served, relative to
  // the base URL at which the target is being served (ignored if this
  // file is not intended to be served over HTTP).
  self.url = null;

  // Is this file guaranteed to never change, so that we can let it be
  // cached forever? Only makes sense of self.url is set.
  self.cacheable = options.cacheable || false;

  // The node_modules directory that Npm.require() should search when
  // called from inside this file, given as a NodeModulesDirectory, or
  // null if Npm.depend() is not in effect for this file. Only works
  // in the "server" architecture.
  self.nodeModulesDirectory = null;

  // For server JS only. Assets associated with this slice; map from the path
  // that is the argument to Assets.getBinary, to a Buffer that is its contents.
  self.assets = null;

  self._contents = options.data || null; // contents, if known, as a Buffer
  self._hash = options.hash || null; // hash, if known, as a hex string
};

_.extend(File.prototype, {
  hash: function () {
    var self = this;
    if (! self._hash)
      self._hash = Builder.sha1(self.contents());
    return self._hash;
  },

  // Omit encoding to get a buffer, or provide something like 'utf8'
  // to get a string
  contents: function (encoding) {
    var self = this;
    if (! self._contents) {
      if (! self.sourcePath) {
        throw new Error("Have neither contents nor sourcePath for file");
      }
      else
        self._contents = fs.readFileSync(self.sourcePath);
    }

    return encoding ? self._contents.toString(encoding) : self._contents;
  },

  setContents: function (b) {
    var self = this;
    if (!(b instanceof Buffer))
      throw new Error("Must set contents to a Buffer");
    self._contents = b;
    // Un-cache hash.
    self._hash = null;
  },

  size: function () {
    var self = this;
    return self.contents().length;
  },

  // Set the URL (and target path) of this file to "/<hash><suffix>". suffix
  // will typically be used to pick a reasonable extension. Also set cacheable
  // to true, since the file's name is now derived from its contents.

  // Also allow a special second suffix that will *only* be postpended to the
  // url, useful for query parameters.
  setUrlToHash: function (fileAndUrlSuffix, urlSuffix) {
    var self = this;
    urlSuffix = urlSuffix || "";
    self.url = "/" + self.hash() + fileAndUrlSuffix + urlSuffix;
    self.cacheable = true;
    self.targetPath = self.hash() + fileAndUrlSuffix;
  },

  // Append "?<hash>" to the URL and mark the file as cacheable.
  addCacheBuster: function () {
    var self = this;
    if (! self.url)
      throw new Error("File must have a URL");
    if (self.cacheable)
      return; // eg, already got setUrlToHash
    if (/\?/.test(self.url))
      throw new Error("URL already has a query string");
    self.url += "?" + self.hash();
    self.cacheable = true;
  },

  // Given a relative path like 'a/b/c' (where '/' is this system's
  // path component separator), produce a URL that always starts with
  // a forward slash and that uses a literal forward slash as the
  // component separator.
  setUrlFromRelPath: function (relPath) {
    var self = this;
    var url = relPath.split(path.sep).join('/');

    if (url.charAt(0) !== '/')
      url = '/' + url;

    self.url = url;
  },

  setTargetPathFromRelPath: function (relPath) {
    var self = this;
    // XXX hack
    if (relPath.match(/^packages\//) || relPath.match(/^assets\//))
      self.targetPath = relPath;
    else
      self.targetPath = path.join('app', relPath);
  },

  // Set a source map for this File. sourceMap is given as a string.
  setSourceMap: function (sourceMap, root) {
    var self = this;

    if (typeof sourceMap !== "string")
      throw new Error("sourceMap must be given as a string");
    self.sourceMap = sourceMap;
    self.sourceMapRoot = root;
  },

  // note: this assets object may be shared among multiple files!
  setAssets: function (assets) {
    var self = this;
    if (!_.isEmpty(assets))
      self.assets = assets;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Target
///////////////////////////////////////////////////////////////////////////////

// options:
// - library: package library to use for resolving package dependenices
// - arch: the architecture to build
//
// see subclasses for additional options
var Target = function (options) {
  var self = this;

  // Package library to use for resolving package dependenices.
  self.library = options.library;

  // Something like "browser.w3c" or "os" or "os.osx.x86_64"
  self.arch = options.arch;

  // All of the Slices that are to go into this target, in the order
  // that they are to be loaded.
  self.slices = [];

  // JavaScript files. List of File. They will be loaded at startup in
  // the order given.
  self.js = [];

  // On-disk dependencies of this target.
  self.watchSet = new watch.WatchSet();

  // Map from package name to package directory of all packages used.
  self.pluginProviderPackageDirs = {};

  // node_modules directories that we need to copy into the target (or
  // otherwise make available at runtime). A map from an absolute path
  // on disk (NodeModulesDirectory.sourcePath) to a
  // NodeModulesDirectory object that we have created to represent it.
  self.nodeModulesDirectories = {};

  // Static assets to include in the bundle. List of File.
  // For browser targets, these are served over HTTP.
  self.asset = [];
};

_.extend(Target.prototype, {
  // Top-level entry point for building a target. Generally to build a
  // target, you create with 'new', call make() to specify its sources
  // and build options and actually do the work of buliding the
  // target, and finally you retrieve the build product with a
  // target-type-dependent function such as write() or toJsImage().
  //
  // options
  // - packages: packages to include (Package or 'foo' or 'foo.slice'),
  //   per _determineLoadOrder
  // - test: packages to test (Package or 'foo'), per _determineLoadOrder
  // - minify: true to minify
  // - addCacheBusters: if true, make all files cacheable by adding
  //   unique query strings to their URLs. unlikely to be of much use
  //   on server targets.
  make: function (options) {
    var self = this;

    // Populate the list of slices to load
    self._determineLoadOrder({
      packages: options.packages || [],
      test: options.test || []
    });

    // Link JavaScript and set up self.js, etc.
    self._emitResources();

    // Preprocess and concatenate CSS files for client targets.
    if (self instanceof ClientTarget) {
      self.mergeCss();
    }

    // Minify, if requested
    if (options.minify) {
      var minifiers = unipackage.load({
        library: self.library,
        packages: ['minifiers']
      }).minifiers;
      self.minifyJs(minifiers);

      // CSS is minified only for client targets.
      if (self instanceof ClientTarget) {
        self.minifyCss(minifiers);
      }
    }

    if (options.addCacheBusters) {
      // Make client-side CSS and JS assets cacheable forever, by
      // adding a query string with a cache-busting hash.
      self._addCacheBusters("js");
      self._addCacheBusters("css");
    }
  },

  // Determine the packages to load, create Slices for
  // them, put them in load order, save in slices.
  //
  // options include:
  // - packages: an array of packages (or, properly speaking, slices)
  //   to include. Each element should either be a Package object or a
  //   package name as a string (to include that package's default
  //   slices for this arch, or a string of the form 'package.slice'
  //   to include a particular named slice from a particular package.
  // - test: an array of packages (as Package objects or as name
  //   strings) whose test slices should be included
  _determineLoadOrder: function (options) {
    var self = this;
    var library = self.library;

    // Find the roots
    var rootSlices =
      _.flatten([
        _.map(options.packages || [], function (p) {
          if (typeof p === "string")
            return library.getSlices(p, self.arch);
          else
            return p.getDefaultSlices(self.arch);
        }),
        _.map(options.test || [], function (p) {
          var pkg = (typeof p === "string" ? library.get(p) : p);
          return pkg.getTestSlices(self.arch);
        })
      ]);

    // PHASE 1: Which slices will be used?
    //
    // Figure out which slices are going to be used in the target, regardless of
    // order. We ignore weak dependencies here, because they don't actually
    // create a "must-use" constraint, just an ordering constraint.

    // What slices will be used in the target? Built in Phase 1, read in
    // Phase 2.
    var getsUsed = {};  // Map from slice.id to Slice.
    var addToGetsUsed = function (slice) {
      if (_.has(getsUsed, slice.id))
        return;
      getsUsed[slice.id] = slice;
      slice.eachUsedSlice(self.arch, {skipWeak: true}, addToGetsUsed);
    };
    _.each(rootSlices, addToGetsUsed);

    // PHASE 2: In what order should we load the slices?
    //
    // Set self.slices to be all of the roots, plus all of their non-weak
    // dependencies, in the correct load order. "Load order" means that if X
    // depends on (uses) Y, and that relationship is not marked as unordered, Y
    // appears before X in the ordering. Raises an exception iff there is no
    // such ordering (due to circular dependency).

    // What slices have not yet been added to self.slices?
    var needed = _.clone(getsUsed);  // Map from slice.id to Slice.
    // Slices that we are in the process of adding; used to detect circular
    // ordered dependencies.
    var onStack = {};  // Map from slice.id to true.

    // This helper recursively adds slice's ordered dependencies to self.slices,
    // then adds slice itself.
    var add = function (slice) {
      // If this has already been added, there's nothing to do.
      if (!_.has(needed, slice.id))
        return;

      // Process each ordered dependency. (If we have an unordered dependency
      // `u`, then there's no reason to add it *now*, and for all we know, `u`
      // will depend on `slice` and need to be added after it. So we ignore
      // those edge. Because we did follow those edges in Phase 1, any unordered
      // slices were at some point in `needed` and will not be left out).
      slice.eachUsedSlice(
        self.arch, {skipUnordered: true}, function (usedSlice, useOptions) {
          // If this is a weak dependency, and nothing else in the target had a
          // strong dependency on it, then ignore this edge.
          if (useOptions.weak && ! _.has(getsUsed, usedSlice.id))
            return;
          if (onStack[usedSlice.id]) {
            buildmessage.error("circular dependency between packages " +
                               slice.pkg.name + " and " + usedSlice.pkg.name);
            // recover by not enforcing one of the depedencies
            return;
          }
          onStack[usedSlice.id] = true;
          add(usedSlice);
          delete onStack[usedSlice.id];
        });
      self.slices.push(slice);
      delete needed[slice.id];
    };

    while (true) {
      // Get an arbitrary slice from those that remain, or break if none remain.
      var first = null;
      for (first in needed) break;
      if (! first)
        break;
      // Now add it, after its ordered dependencies.
      add(needed[first]);
    }
  },

  // Process all of the sorted slices (which includes running the JavaScript
  // linker).
  _emitResources: function () {
    var self = this;

    var isBrowser = archinfo.matches(self.arch, "browser");
    var isOs = archinfo.matches(self.arch, "os");

    // Copy their resources into the bundle in order
    _.each(self.slices, function (slice) {
      var isApp = ! slice.pkg.name;

      // Emit the resources
      var resources = slice.getResources(self.arch);

      // First, find all the assets, so that we can associate them with each js
      // resource (for os slices).
      var sliceAssets = {};
      _.each(resources, function (resource) {
        if (resource.type !== "asset")
          return;

        var f = new File({
          data: resource.data,
          cacheable: false,
          hash: resource.hash
        });

        var relPath = isOs
              ? path.join("assets", resource.servePath)
              : stripLeadingSlash(resource.servePath);
        f.setTargetPathFromRelPath(relPath);

        if (isBrowser)
          f.setUrlFromRelPath(resource.servePath);
        else {
          sliceAssets[resource.path] = resource.data;
        }

        self.asset.push(f);
      });

      // Now look for the other kinds of resources.
      _.each(resources, function (resource) {
        if (resource.type === "asset")
          return;  // already handled

        if (_.contains(["js", "css"], resource.type)) {
          if (resource.type === "css" && ! isBrowser)
            // XXX might be nice to throw an error here, but then we'd
            // have to make it so that packages.js ignores css files
            // that appear in the server directories in an app tree

            // XXX XXX can't we easily do that in the css handler in
            // meteor.js?
            return;

          var f = new File({data: resource.data, cacheable: false});

          var relPath = stripLeadingSlash(resource.servePath);
          f.setTargetPathFromRelPath(relPath);

          if (isBrowser) {
            f.setUrlFromRelPath(resource.servePath);
          }

          if (resource.type === "js" && isOs) {
            // Hack, but otherwise we'll end up putting app assets on this file.
            if (resource.servePath !== "/packages/global-imports.js")
              f.setAssets(sliceAssets);

            if (! isApp && slice.nodeModulesPath) {
              var nmd = self.nodeModulesDirectories[slice.nodeModulesPath];
              if (! nmd) {
                nmd = new NodeModulesDirectory({
                  sourcePath: slice.nodeModulesPath,
                  // It's important that this path end with
                  // node_modules. Otherwise, if two modules in this package
                  // depend on each other, they won't be able to find each
                  // other!
                  preferredBundlePath: path.join(
                    'npm', slice.pkg.name, slice.sliceName, 'node_modules')
                });
                self.nodeModulesDirectories[slice.nodeModulesPath] = nmd;
              }
              f.nodeModulesDirectory = nmd;
            }
          }

          // Both CSS and JS files can have source maps
          if (resource.sourceMap) {
            f.setSourceMap(resource.sourceMap, path.dirname(relPath));
          }

          self[resource.type].push(f);
          return;
        }

        if (_.contains(["head", "body"], resource.type)) {
          if (! isBrowser)
            throw new Error("HTML segments can only go to the browser");
          self[resource.type].push(resource.data);
          return;
        }

        throw new Error("Unknown type " + resource.type);
      });

      // Depend on the source files that produced these resources.
      self.watchSet.merge(slice.watchSet);
      // Remember the library resolution of all packages used in these
      // resources.
      // XXX assumes that this merges cleanly
      _.extend(self.pluginProviderPackageDirs,
               slice.pkg.pluginProviderPackageDirs)
    });
  },

  // Minify the JS in this target
  minifyJs: function (minifiers) {
    var self = this;

    var allJs = _.map(self.js, function (file) {
      return file.contents('utf8');
    }).join('\n;\n');

    allJs = minifiers.UglifyJSMinify(allJs, {
      fromString: true,
      compress: {drop_debugger: false}
    }).code;

    self.js = [new File({ data: new Buffer(allJs, 'utf8') })];
    self.js[0].setUrlToHash(".js");
  },

  // For each resource of the given type, make it cacheable by adding
  // a query string to the URL based on its hash.
  _addCacheBusters: function (type) {
    var self = this;
    _.each(self[type], function (file) {
      file.addCacheBuster();
    });
  },

  // Return the WatchSet for this target's dependency info.
  getWatchSet: function () {
    var self = this;
    return self.watchSet;
  },

  getPluginProviderPackageDirs: function () {
    var self = this;
    return self.pluginProviderPackageDirs;
  },

  // Return the most inclusive architecture with which this target is
  // compatible. For example, if we set out to build a
  // 'os.linux.x86_64' version of this target (by passing that as
  // the 'arch' argument to the constructor), but ended up not
  // including anything that was specific to Linux, the return value
  // would be 'os'.
  mostCompatibleArch: function () {
    var self = this;
    return archinfo.leastSpecificDescription(_.pluck(self.slices, 'arch'));
  }
});


//////////////////// ClientTarget ////////////////////

var ClientTarget = function (options) {
  var self = this;
  Target.apply(this, arguments);

  // CSS files. List of File. They will be loaded in the order given.
  self.css = [];
  // Cached CSS AST. If non-null, self.css has one item in it, processed CSS
  // from merged input files, and this is its parse tree.
  self._cssAstCache = null;

  // List of segments of additional HTML for <head>/<body>.
  self.head = [];
  self.body = [];

  if (! archinfo.matches(self.arch, "browser"))
    throw new Error("ClientTarget targeting something that isn't a browser?");
};

inherits(ClientTarget, Target);

_.extend(ClientTarget.prototype, {
  // Lints CSS files and merges them into one file, fixing up source maps and
  // pulling any @import directives up to the top since the CSS spec does not
  // allow them to appear in the middle of a file.
  mergeCss: function () {
    var self = this;
    var minifiers = unipackage.load({
      library: self.library,
      packages: ['minifiers']
    }).minifiers;
    var CssTools = minifiers.CssTools;

    // Filenames passed to AST manipulator mapped to their original files
    var originals = {};

    var cssAsts = _.map(self.css, function (file) {
      var filename = file.url.replace(/^\//, '');
      originals[filename] = file;
      try {
        var parseOptions = { source: filename, position: true };
        var ast = CssTools.parseCss(file.contents('utf8'), parseOptions);
        ast.filename = filename;
      } catch (e) {
        buildmessage.error(e.message, { file: filename });
        return { type: "stylesheet", stylesheet: { rules: [] },
                 filename: filename };
      }

      return ast;
    });

    var warnCb = function (filename, msg) {
      // XXX make this a buildmessage.warning call rather than a random log.
      //     this API would be like buildmessage.error, but wouldn't cause
      //     the build to fail.
      runLog.log(filename + ': warn: ' + msg);
    };

    // Other build phases might need this AST later
    self._cssAstCache = CssTools.mergeCssAsts(cssAsts, warnCb);

    // Overwrite the CSS files list with the new concatenated file
    var stringifiedCss = CssTools.stringifyCss(self._cssAstCache,
                                               { sourcemap: true });
    self.css = [new File({ data: new Buffer(stringifiedCss.code, 'utf8') })];

    // Add the contents of the input files to the source map of the new file
    stringifiedCss.map.sourcesContent =
      _.map(stringifiedCss.map.sources, function (filename) {
        return originals[filename].contents('utf8');
      });

    // If any input files had source maps, apply them.
    // Ex.: less -> css source map should be composed with css -> css source map
    var newMap = sourcemap.SourceMapGenerator.fromSourceMap(
      new sourcemap.SourceMapConsumer(stringifiedCss.map));

    _.each(originals, function (file, name) {
      if (! file.sourceMap)
        return;
      try {
        newMap.applySourceMap(
          new sourcemap.SourceMapConsumer(file.sourceMap), name);
      } catch (err) {
        // If we can't apply the source map, silently drop it.
        //
        // XXX This is here because there are some less files that
        // produce source maps that throw when consumed. We should
        // figure out exactly why and fix it, but this will do for now.
      }
    });

    self.css[0].setSourceMap(JSON.stringify(newMap));
    self.css[0].setUrlToHash(".css");
  },
  // Minify the CSS in this target
  minifyCss: function (minifiers) {
    var self = this;
    var minifiedCss = '';

    // If there is an AST already calculated, don't waste time on parsing it
    // again.
    if (self._cssAstCache) {
      minifiedCss = minifiers.CssTools.minifyCssAst(self._cssAstCache);
    } else if (self.css) {
      var allCss = _.map(self.css, function (file) {
        return file.contents('utf8');
      }).join('\n');

      minifiedCss = minifiers.CssTools.minifyCss(allCss);
    }

    self.css = [new File({ data: new Buffer(minifiedCss, 'utf8') })];
    self.css[0].setUrlToHash(".css", "?meteor_css_resource=true");
  },

  // XXX Instead of packaging the boilerplate in the client program, the
  // template should be part of WebApp, and we should make sure that all
  // information that it needs is in the manifest (ie, make sure to include head
  // and body).  Then it will just need to do one level of templating instead
  // of two.  Alternatively, use spacebars with unipackage.load here.
  generateHtmlBoilerplate: function () {
    var self = this;

    var html = [];
    html.push('<!DOCTYPE html>\n' +
              '<html##HTML_ATTRIBUTES##>\n' +
              '<head>\n');
    _.each(self.css, function (css) {
      html.push('  <link rel="stylesheet" href="##BUNDLED_JS_CSS_PREFIX##');
      html.push(_.escape(css.url));
      html.push('">\n');
    });
    html.push('\n\n##RUNTIME_CONFIG##\n\n');
    _.each(self.js, function (js) {
      html.push('  <script type="text/javascript" src="##BUNDLED_JS_CSS_PREFIX##');
      html.push(_.escape(js.url));
      html.push('"></script>\n');
    });
    html.push('\n\n##RELOAD_SAFETYBELT##');
    html.push('\n\n');
    html.push(self.head.join('\n'));  // unescaped!
    html.push('\n' +
              '</head>\n' +
              '<body>\n');
    html.push(self.body.join('\n'));  // unescaped!
    html.push('\n' +
              '</body>\n' +
              '</html>\n');
    return new Buffer(html.join(''), 'utf8');
  },

  // Output the finished target to disk
  //
  // Returns the path (relative to 'builder') of the control file for
  // the target
  write: function (builder) {
    var self = this;

    builder.reserve("program.json");
    builder.reserve("app.html");

    // Helper to iterate over all resources that we serve over HTTP.
    var eachResource = function (f) {
      _.each(["js", "css", "asset"], function (type) {
        _.each(self[type], function (file) {
          f(file, type);
        });
      });
    };

    // Reserve all file names from the manifest, so that interleaved
    // generateFilename calls don't overlap with them.
    eachResource(function (file, type) {
      builder.reserve(file.targetPath);
    });

    // Build up a manifest of all resources served via HTTP.
    var manifest = [];
    eachResource(function (file, type) {
      var fileContents = file.contents();

      var manifestItem = {
        path: file.targetPath,
        where: "client",
        type: type,
        cacheable: file.cacheable,
        url: file.url
      };

      if (file.sourceMap) {
        // Add anti-XSSI header to this file which will be served over
        // HTTP. Note that the Mozilla and WebKit implementations differ as to
        // what they strip: Mozilla looks for the four punctuation characters
        // but doesn't care about the newline; WebKit only looks for the first
        // three characters (not the single quote) and then strips everything up
        // to a newline.
        // https://groups.google.com/forum/#!topic/mozilla.dev.js-sourcemap/3QBr4FBng5g
        var mapData = new Buffer(")]}'\n" + file.sourceMap, 'utf8');
        manifestItem.sourceMap = builder.writeToGeneratedFilename(
          file.targetPath + '.map', {data: mapData});

        // Use a SHA to make this cacheable.
        var sourceMapBaseName = file.hash() + ".map";
        // XXX When we can, drop all of this and just use the SourceMap
        //     header. FF doesn't support that yet, though:
        //         https://bugzilla.mozilla.org/show_bug.cgi?id=765993
        // Note: if we use the older '//@' comment, FF 24 will print a lot
        // of warnings to the console. So we use the newer '//#' comment...
        // which Chrome (28) doesn't support. So we also set X-SourceMap
        // in webapp_server.
        file.setContents(Buffer.concat([
          file.contents(),
          new Buffer("\n//# sourceMappingURL=" + sourceMapBaseName + "\n")
        ]));
        manifestItem.sourceMapUrl = require('url').resolve(
          file.url, sourceMapBaseName);
      }

      // Set this now, in case we mutated the file's contents.
      manifestItem.size = file.size();
      manifestItem.hash = file.hash();

      writeFile(file, builder);

      manifest.push(manifestItem);
    });

    // HTML boilerplate (the HTML served to make the client load the
    // JS and CSS files and start the app)
    var htmlBoilerplate = self.generateHtmlBoilerplate();
    builder.write('app.html', { data: htmlBoilerplate });
    manifest.push({
      path: 'app.html',
      where: 'internal',
      hash: Builder.sha1(htmlBoilerplate)
    });

    // Control file
    builder.writeJson('program.json', {
      format: "browser-program-pre1",
      page: 'app.html',
      manifest: manifest
    });
    return "program.json";
  }
});


//////////////////// JsImageTarget and JsImage  ////////////////////

// A JsImage (JavaScript Image) is a fully linked JavaScript program
// that is totally ready to go. (Image is used in the sense of "the
// output of a linker", as in "executable image", rather than in the
// sense of "visual picture").
//
// A JsImage can be loaded into its own new JavaScript virtual
// machine, or it can be loaded into an existing virtual machine as a
// plugin.
var JsImage = function () {
  var self = this;

  // Array of objects with keys:
  // - targetPath: relative path to use if saved to disk (or for stack traces)
  // - source: JS source code to load, as a string
  // - nodeModulesDirectory: a NodeModulesDirectory indicating which
  //   directory should be searched by Npm.require()
  // - sourceMap: if set, source map for this code, as a string
  // note: this can't be called `load` at it would shadow `load()`
  self.jsToLoad = [];

  // node_modules directories that we need to copy into the target (or
  // otherwise make available at runtime). A map from an absolute path
  // on disk (NodeModulesDirectory.sourcePath) to a
  // NodeModulesDirectory object that we have created to represent it.
  self.nodeModulesDirectories = {};

  // Architecture required by this image
  self.arch = null;
};

_.extend(JsImage.prototype, {
  // Load the image into the current process. It gets its own unique
  // Package object containing its own private copy of every
  // unipackage that it uses. This Package object is returned.
  //
  // If `bindings` is provided, it is a object containing a set of
  // variables to set in the global environment of the executed
  // code. The keys are the variable names and the values are their
  // values. In addition to the contents of `bindings`, Package and
  // Npm will be provided.
  //
  // XXX throw an error if the image includes any "app-style" code
  // that is built to put symbols in the global namespace rather than
  // in a compartment of Package
  load: function (bindings) {
    var self = this;
    var ret = {};

    // XXX This is mostly duplicated from server/boot.js, as is Npm.require
    // below. Some way to avoid this?
    var getAsset = function (assets, assetPath, encoding, callback) {
      var fut;
      if (! callback) {
        if (! Fiber.current)
          throw new Error("The synchronous Assets API can " +
                          "only be called from within a Fiber.");
        fut = new Future();
        callback = fut.resolver();
      }
      var _callback = function (err, result) {
        if (result && ! encoding)
          // Sadly, this copies in Node 0.10.
          result = new Uint8Array(result);
        callback(err, result);
      };

      if (!assets || !_.has(assets, assetPath)) {
        _.callback(new Error("Unknown asset: " + assetPath));
      } else {
        var buffer = assets[assetPath];
        var result = encoding ? buffer.toString(encoding) : buffer;
        _callback(null, result);
      }
      if (fut)
        return fut.wait();
    };

    // Eval each JavaScript file, providing a 'Npm' symbol in the same
    // way that the server environment would, a 'Package' symbol
    // so the loaded image has its own private universe of loaded
    // packages, and an 'Assets' symbol to help the package find its
    // static assets.
    var failed = false;
    _.each(self.jsToLoad, function (item) {
      if (failed)
        return;

      var env = _.extend({
        Package: ret,
        Npm: {
          require: function (name) {
            if (! item.nodeModulesDirectory) {
              // No Npm.depends associated with this package
              return require(name);
            }

            var nodeModuleDir =
              path.join(item.nodeModulesDirectory.sourcePath, name);

            if (fs.existsSync(nodeModuleDir)) {
              return require(nodeModuleDir);
            }
            try {
              return require(name);
            } catch (e) {
              throw new Error("Can't load npm module '" + name +
                              "' while loading " + item.targetPath +
                              ". Check your Npm.depends().'");
            }
          }
        },
        Assets: {
          getText: function (assetPath, callback) {
            return getAsset(item.assets, assetPath, "utf8", callback);
          },
          getBinary: function (assetPath, callback) {
            return getAsset(item.assets, assetPath, undefined, callback);
          }
        }
      }, bindings || {});

      try {
        // XXX XXX Get the actual source file path -- item.targetPath
        // is not actually correct (it's the path in the bundle rather
        // than in the source tree).
        files.runJavaScript(item.source.toString('utf8'), {
          filename: item.targetPath,
          symbols: env,
          sourceMap: item.sourceMap,
          sourceMapRoot: item.sourceMapRoot
        });
      } catch (e) {
        buildmessage.exception(e);
        // Recover by skipping the rest of the load
        failed = true;
        return;
      }
    });

    return ret;
  },

  // Write this image out to disk
  //
  // Returns the path (relative to 'builder') of the control file for
  // the image
  write: function (builder) {
    var self = this;

    builder.reserve("program.json");

    // Finalize choice of paths for node_modules directories -- These
    // paths are no longer just "preferred"; they are the final paths
    // that we will use
    var nodeModulesDirectories = [];
    _.each(self.nodeModulesDirectories || [], function (nmd) {
      nodeModulesDirectories.push(new NodeModulesDirectory({
        sourcePath: nmd.sourcePath,
        preferredBundlePath: builder.generateFilename(nmd.preferredBundlePath,
                                                      { directory: true })
      }));
    });

    // If multiple load files share the same asset, only write one copy of
    // each. (eg, for app assets).
    var assetFilesBySha = {};

    // JavaScript sources
    var load = [];
    _.each(self.jsToLoad, function (item) {
      if (! item.targetPath)
        throw new Error("No targetPath?");

      var loadPath = builder.writeToGeneratedFilename(
        item.targetPath,
        { data: new Buffer(item.source, 'utf8') });
      var loadItem = {
        path: loadPath,
        node_modules: item.nodeModulesDirectory ?
          item.nodeModulesDirectory.preferredBundlePath : undefined
      };

      if (item.sourceMap) {
        // Write the source map.
        // XXX this code is very similar to saveAsUnipackage.
        loadItem.sourceMap = builder.writeToGeneratedFilename(
          item.targetPath + '.map',
          { data: new Buffer(item.sourceMap, 'utf8') }
        );
        loadItem.sourceMapRoot = item.sourceMapRoot;
      }

      if (!_.isEmpty(item.assets)) {
        // For package code, static assets go inside a directory inside
        // assets/packages specific to this package. Application assets (e.g. those
        // inside private/) go in assets/app/.
        // XXX same hack as setTargetPathFromRelPath
          var assetBundlePath;
        if (item.targetPath.match(/^packages\//)) {
          var dir = path.dirname(item.targetPath);
          var base = path.basename(item.targetPath, ".js");
          assetBundlePath = path.join('assets', dir, base);
        } else {
          assetBundlePath = path.join('assets', 'app');
        }

        loadItem.assets = {};
        _.each(item.assets, function (data, relPath) {
          var sha = Builder.sha1(data);
          if (_.has(assetFilesBySha, sha)) {
            loadItem.assets[relPath] = assetFilesBySha[sha];
          } else {
            loadItem.assets[relPath] = assetFilesBySha[sha] =
              builder.writeToGeneratedFilename(
                path.join(assetBundlePath, relPath), { data: data });
          }
        });
      }

      load.push(loadItem);
    });

    // node_modules resources from the packages. Due to appropriate
    // builder configuration, 'meteor bundle' and 'meteor deploy' copy
    // them, and 'meteor run' symlinks them. If these contain
    // arch-specific code then the target will end up having an
    // appropriately specific arch.
    _.each(nodeModulesDirectories, function (nmd) {
      builder.copyDirectory({
        from: nmd.sourcePath,
        to: nmd.preferredBundlePath
      });
    });

    // Control file
    builder.writeJson('program.json', {
      format: "javascript-image-pre1",
      arch: self.arch,
      load: load
    });
    return "program.json";
  }
});

// Create a JsImage by loading a bundle of format
// 'javascript-image-pre1' from disk (eg, previously written out with
// write()). `dir` is the path to the control file.
JsImage.readFromDisk = function (controlFilePath) {
  var ret = new JsImage;
  var json = JSON.parse(fs.readFileSync(controlFilePath));
  var dir = path.dirname(controlFilePath);

  if (json.format !== "javascript-image-pre1")
    throw new Error("Unsupported plugin format: " +
                    JSON.stringify(json.format));

  ret.arch = json.arch;

  _.each(json.load, function (item) {
    rejectBadPath(item.path);

    var nmd = undefined;
    if (item.node_modules) {
      rejectBadPath(item.node_modules);
      var node_modules = path.join(dir, item.node_modules);
      if (! (node_modules in ret.nodeModulesDirectories)) {
        ret.nodeModulesDirectories[node_modules] =
          new NodeModulesDirectory({
            sourcePath: node_modules,
            preferredBundlePath: item.node_modules
          });
      }
      nmd = ret.nodeModulesDirectories[node_modules];
    }

    var loadItem = {
      targetPath: item.path,
      source: fs.readFileSync(path.join(dir, item.path)),
      nodeModulesDirectory: nmd
    };

    if (item.sourceMap) {
      // XXX this is the same code as initFromUnipackage
      rejectBadPath(item.sourceMap);
      loadItem.sourceMap = fs.readFileSync(
        path.join(dir, item.sourceMap), 'utf8');
      loadItem.sourceMapRoot = item.sourceMapRoot;
    }

    if (!_.isEmpty(item.assets)) {
      loadItem.assets = {};
      _.each(item.assets, function (filename, relPath) {
        loadItem.assets[relPath] = fs.readFileSync(path.join(dir, filename));
      });
    }

    ret.jsToLoad.push(loadItem);
  });

  return ret;
};

var JsImageTarget = function (options) {
  var self = this;
  Target.apply(this, arguments);

  if (! archinfo.matches(self.arch, "os"))
    // Conceivably we could support targeting the browser as long as
    // no native node modules were used.  No use case for that though.
    throw new Error("JsImageTarget targeting something unusual?");
};

inherits(JsImageTarget, Target);

_.extend(JsImageTarget.prototype, {
  toJsImage: function () {
    var self = this;
    var ret = new JsImage;

    _.each(self.js, function (file) {
      ret.jsToLoad.push({
        targetPath: file.targetPath,
        source: file.contents().toString('utf8'),
        nodeModulesDirectory: file.nodeModulesDirectory,
        assets: file.assets,
        sourceMap: file.sourceMap,
        sourceMapRoot: file.sourceMapRoot
      });
    });

    ret.nodeModulesDirectories = self.nodeModulesDirectories;
    ret.arch = self.mostCompatibleArch();

    return ret;
  }
});


//////////////////// ServerTarget ////////////////////

// options:
// - clientTarget: the ClientTarget to serve up over HTTP as our client
// - releaseName: the Meteor release name (for retrieval at runtime)
var ServerTarget = function (options) {
  var self = this;
  JsImageTarget.apply(this, arguments);

  self.clientTarget = options.clientTarget;
  self.releaseName = options.releaseName;
  self.library = options.library;

  if (! archinfo.matches(self.arch, "os"))
    throw new Error("ServerTarget targeting something that isn't a server?");
};

inherits(ServerTarget, JsImageTarget);

_.extend(ServerTarget.prototype, {
  // Output the finished target to disk
  // options:
  // - omitDependencyKit: if true, don't copy node_modules from dev_bundle
  // - getRelativeTargetPath: a function that takes {forTarget:
  //   Target, relativeTo: Target} and return the path of one target
  //   in the bundle relative to another. hack to get the path of the
  //   client target.. we'll find a better solution here eventually
  //
  // Returns the path (relative to 'builder') of the control file for
  // the plugin
  write: function (builder, options) {
    var self = this;

    // Pick a start script name
    // XXX base it on the name of the target
    var scriptName = 'start.sh';
    builder.reserve(scriptName);

    // This is where the dev_bundle will be downloaded and unpacked
    builder.reserve('dependencies');

    // Relative path to our client, if we have one (hack)
    var clientTargetPath;
    if (self.clientTarget) {
      clientTargetPath = path.join(options.getRelativeTargetPath({
        forTarget: self.clientTarget, relativeTo: self}),
                                   'program.json');
    }

    // We will write out config.json, the dependency kit, and the
    // server driver alongside the JsImage
    builder.writeJson("config.json", {
      meteorRelease: self.releaseName || undefined,
      client: clientTargetPath || undefined
    });

    if (! options.omitDependencyKit)
      builder.reserve("node_modules", { directory: true });

    // Linked JavaScript image (including static assets, assuming that there are
    // any JS files at all)
    var imageControlFile = self.toJsImage().write(builder);

    // Server bootstrap
    builder.write('boot.js',
                  { file: path.join(__dirname, 'server', 'boot.js') });

    // Script that fetches the dev_bundle and runs the server bootstrap
    var archToPlatform = {
      'os.linux.x86_32': 'Linux_i686',
      'os.linux.x86_64': 'Linux_x86_64',
      'os.osx.x86_64': 'Darwin_x86_64'
    };
    var arch = archinfo.host();
    var platform = archToPlatform[arch];
    if (! platform) {
      buildmessage.error("MDG does not publish dev_bundles for arch: " +
                         arch);
      // Recover by bailing out and leaving a partially built target
      return;
    }

    var devBundleVersion =
      fs.readFileSync(
        path.join(files.getDevBundle(), '.bundle_version.txt'), 'utf8');
    devBundleVersion = devBundleVersion.split('\n')[0];

    var script = unipackage.load({
      library: self.library,
      packages: ['dev-bundle-fetcher']
    })["dev-bundle-fetcher"].DevBundleFetcher.script();
    script = script.replace(/##PLATFORM##/g, platform);
    script = script.replace(/##BUNDLE_VERSION##/g, devBundleVersion);
    script = script.replace(/##IMAGE##/g, imageControlFile);
    script = script.replace(/##RUN_FILE##/g, 'boot.js');
    builder.write(scriptName, { data: new Buffer(script, 'utf8'),
                                executable: true });

    // Main, architecture-dependent node_modules from the dependency
    // kit. This one is copied in 'meteor bundle', symlinked in
    // 'meteor run', and omitted by 'meteor deploy' (Galaxy provides a
    // version that's appropriate for the server architecture).
    if (! options.omitDependencyKit) {
      builder.copyDirectory({
        from: path.join(files.getDevBundle(), 'lib', 'node_modules'),
        to: 'node_modules',
        ignore: ignoreFiles
      });
    }

    return scriptName;
  }
});

var writeFile = function (file, builder) {
  if (! file.targetPath)
    throw new Error("No targetPath?");
  var contents = file.contents();
  if (! (contents instanceof Buffer))
    throw new Error("contents not a Buffer?");
  // XXX should probably use sanitize: true, but that will have
  // to wait until the server is actually driven by the manifest
  // (rather than just serving all of the files in a certain
  // directories)
  builder.write(file.targetPath, { data: file.contents() });
};

///////////////////////////////////////////////////////////////////////////////
// writeSiteArchive
///////////////////////////////////////////////////////////////////////////////

// targets is a set of Targets to include in the bundle, as a map from
// target name (to use in the bundle) to a Target. outputPath is the
// path of a directory that should be created to contain the generated
// site archive.
//
// Returns:

// {
//     watchSet: watch.WatchSet for all files and directories that ultimately went
//     starManifest: the JSON manifest of the star
// }
// into the bundle.
//
// options:
// - nodeModulesMode: "skip", "symlink", "copy"
// - builtBy: vanity identification string to write into metadata
// - controlProgram: name of the control program (should be a target name)
// - releaseName: The Meteor release version
var writeSiteArchive = function (targets, outputPath, options) {
  var builder = new Builder({
    outputPath: outputPath,
    symlink: options.nodeModulesMode === "symlink"
  });

  if (options.controlProgram && ! (options.controlProgram in targets))
    throw new Error("controlProgram '" + options.controlProgram +
                    "' is not the name of a target?");

  try {
    var json = {
      format: "site-archive-pre1",
      builtBy: options.builtBy,
      programs: [],
      control: options.controlProgram || undefined,
      meteorRelease: options.releaseName
    };

    // Pick a path in the bundle for each target
    var paths = {};
    _.each(targets, function (target, name) {
      var p = path.join('programs', name);
      builder.reserve(p, { directory: true });
      paths[name] = p;
    });

    // Hack to let servers find relative paths to clients. Should find
    // another solution eventually (probably some kind of mount
    // directive that mounts the client bundle in the server at runtime)
    var getRelativeTargetPath = function (options) {
      var pathForTarget = function (target) {
        var name;
        _.each(targets, function (t, n) {
          if (t === target)
            name = n;
        });
        if (! name)
          throw new Error("missing target?");

        if (! (name in paths))
          throw new Error("missing target path?");

        return paths[name];
      };

      return path.relative(pathForTarget(options.relativeTo),
                           pathForTarget(options.forTarget));
    };

    // Write out each target
    _.each(targets, function (target, name) {
      var relControlFilePath =
        target.write(builder.enter(paths[name]),
                     { omitDependencyKit: options.nodeModulesMode === "skip",
                       getRelativeTargetPath: getRelativeTargetPath });
      json.programs.push({
        name: name,
        arch: target.mostCompatibleArch(),
        path: path.join(paths[name], relControlFilePath)
      });
    });

    // Tell Galaxy what version of the dependency kit we're using, so
    // it can load the right modules. (Include this even if we copied
    // or symlinked a node_modules, since that's probably enough for
    // it to work in spite of the presence of node_modules for the
    // wrong arch). The place we stash this is grody for temporary
    // reasons of backwards compatibility.
    builder.write(path.join('server', '.bundle_version.txt'), {
      file: path.join(files.getDevBundle(), '.bundle_version.txt')
    });

    // Affordances for standalone use
    if (targets.server) {
      // add program.json as the first argument after "node main.js" to the boot script.
      var stub = new Buffer(exports._mainJsContents, 'utf8');
      builder.write('main.js', { data: stub });

      builder.write('README', { data: new Buffer(
"This is a Meteor application bundle. It has only one dependency:\n" +
"Node.js 0.10.25 or newer, plus the 'fibers' module. To run the application:\n" +
"\n" +
"  $ rm -r programs/server/node_modules/fibers\n" +
"  $ npm install fibers@1.0.1\n" +
"  $ export MONGO_URL='mongodb://user:password@host:port/databasename'\n" +
"  $ export ROOT_URL='http://example.com'\n" +
"  $ export MAIL_URL='smtp://user:password@mailhost:port/'\n" +
"  $ node main.js\n" +
"\n" +
"Use the PORT environment variable to set the port where the\n" +
"application will listen. The default is 80, but that will require\n" +
"root on most systems.\n" +
"\n" +
"Find out more about Meteor at meteor.com.\n",
      'utf8')});
    }

    // Control file
    builder.writeJson('star.json', json);

    // Merge the WatchSet of everything that went into the bundle.
    var watchSet = new watch.WatchSet();
    var dependencySources = [builder].concat(_.values(targets));
    _.each(dependencySources, function (s) {
      watchSet.merge(s.getWatchSet());
    });

    // We did it!
    builder.complete();

    return {
      watchSet: watchSet,
      starManifest: json
    };
  } catch (e) {
    builder.abort();
    throw e;
  }
};

///////////////////////////////////////////////////////////////////////////////
// Main
///////////////////////////////////////////////////////////////////////////////

/**
 * Builds a Meteor app.
 *
 * options are:
 *
 * - appDir: Required. The top-level directory of the Meteor app to
 *   build
 *
 * - outputPath: Required. Path to the directory where the output (a
 *   untarred bundle) should go. This directory will be created if it
 *   doesn't exist, and removed first if it does exist.
 *
 * - nodeModulesMode: what to do about the core npm modules needed by
 *   the server bootstrap. one of:
 *   - 'copy': copy from a prebuilt local installation. used by
 *     'meteor bundle'. the default.
 *   - 'symlink': symlink from a prebuild local installation. used
 *     by 'meteor run'
 *   - 'skip': just leave them out. used by `meteor deploy`. the
 *     server running the app will need to supply appropriate builds
 *     of the modules.
 *
 *   Note that this does not affect the handling of npm modules used
 *   by *packages*, which could be the majority of the npm modules in
 *   your app -- EXCEPT that "symlink" has the added bonus that it
 *   will cause files (not just npm modules) to symlinked rather than
 *   copied whenever possible in the building process. Yeah, this
 *   could stand some refactoring.
 *
 * - buildOptions: may include
 *   - minify: minify the CSS and JS assets (boolean, default false)
 *   - testPackages: array of package objects or package names whose
 *     tests should be additionally included in this bundle
 *
 * Returns an object with keys:
 * - errors: A buildmessage.MessageSet, or falsy if bundling succeeded.
 * - watchSet: Information about files and paths that were
 *   inputs into the bundle and that we may wish to monitor for
 *   changes when developing interactively, as a watch.WatchSet.
 *
 * On failure ('errors' is truthy), no bundle will be output (in fact,
 * outputPath will have been removed if it existed).
 *
 * The currently running version of Meteor (release.current) must
 * match the version called for by the app (unless release.forced is
 * true, meaning that the user explicitly forced us to use this
 * release).
 *
 * Note that when you run "meteor test-packages", appDir points to the
 * test harness, while the local package search paths in 'release'
 * will point somewhere else -- into the app (if any) whose packages
 * you are testing!
 */
exports.bundle = function (options) {
  var appDir = options.appDir;
  var outputPath = options.outputPath;
  var nodeModulesMode = options.nodeModulesMode || 'copy';
  var buildOptions = options.buildOptions || {};

  if (! release.usingRightReleaseForApp(appDir))
    throw new Error("running wrong release for app?");

  var library = release.current.library;
  var releaseName =
    release.current.isCheckout() ? "none" : release.current.name;
  var builtBy = "Meteor" + (release.current.name ?
                            " " + release.current.name : "");

  var success = false;
  var watchSet = new watch.WatchSet();
  var starResult = null;
  var messages = buildmessage.capture({
    title: "building the application"
  }, function () {
    var targets = {};
    var controlProgram = null;

    var makeClientTarget = function (app) {
      var client = new ClientTarget({
        library: library,
        arch: "browser"
      });

      client.make({
        packages: [app],
        test: buildOptions.testPackages || [],
        minify: buildOptions.minify,
        addCacheBusters: true
      });

      return client;
    };

    var makeBlankClientTarget = function () {
      var client = new ClientTarget({
        library: library,
        arch: "browser"
      });
      client.make({
        minify: buildOptions.minify,
        addCacheBusters: true
      });

      return client;
    };

    var makeServerTarget = function (app, clientTarget) {
      var targetOptions = {
        library: library,
        arch: archinfo.host(),
        releaseName: releaseName
      };
      if (clientTarget)
        targetOptions.clientTarget = clientTarget;

      var server = new ServerTarget(targetOptions);

      server.make({
        packages: [app],
        test: buildOptions.testPackages || [],
        minify: false
      });

      return server;
    };

    // Include default targets, unless there's a no-default-targets file in the
    // top level of the app. (This is a very hacky interface which will
    // change. Note, eg, that .meteor/packages is confusingly ignored in this
    // case.)

    var includeDefaultTargets = watch.readAndWatchFile(
      watchSet, path.join(appDir, 'no-default-targets')) === null;

    if (includeDefaultTargets) {
      // Create a Package object that represents the app
      var app = library.getForApp(appDir, ignoreFiles);

      // Client
      var client = makeClientTarget(app);
      targets.client = client;

      // Server
      var server = makeServerTarget(app, client);
      targets.server = server;
    }

    // Pick up any additional targets in /programs
    // Step 1: scan for targets and make a list. We will reload if you create a
    // new subdir in 'programs', or create 'programs' itself.
    var programsDir = path.join(appDir, 'programs');
    var programs = [];
    var programsSubdirs = watch.readAndWatchDirectory(watchSet, {
      absPath: programsDir,
      include: [/\/$/],
      exclude: [/^\./]
    });

    _.each(programsSubdirs, function (item) {
      // Remove trailing slash.
      item = item.substr(0, item.length - 1);

      if (_.has(targets, item)) {
        buildmessage.error("duplicate programs named '" + item + "'");
        // Recover by ignoring this program
        return;
      }
      // Programs must (for now) contain a `package.js` file. If not, then
      // perhaps the directory we are seeing is left over from another git
      // branch or something and we should ignore it.  We don't actually parse
      // the package.js file here, though (but we do restart if it is later
      // added or changed).
      if (watch.readAndWatchFile(
        watchSet, path.join(programsDir, item, 'package.js')) === null) {
        return;
      }

      targets[item] = true;  // will be overwritten with actual target later

      // Read attributes.json, if it exists
      var attrsJsonAbsPath = path.join(programsDir, item, 'attributes.json');
      var attrsJsonRelPath = path.join('programs', item, 'attributes.json');
      var attrsJsonContents = watch.readAndWatchFile(
        watchSet, attrsJsonAbsPath);

      var attrsJson = {};
      if (attrsJsonContents !== null) {
        try {
          attrsJson = JSON.parse(attrsJsonContents);
        } catch (e) {
          if (! (e instanceof SyntaxError))
            throw e;
          buildmessage.error(e.message, { file: attrsJsonRelPath });
          // recover by ignoring attributes.json
        }
      }

      var isControlProgram = !! attrsJson.isControlProgram;
      if (isControlProgram) {
        if (controlProgram !== null) {
          buildmessage.error(
              "there can be only one control program ('" + controlProgram +
              "' is also marked as the control program)",
            { file: attrsJsonRelPath });
          // recover by ignoring that it wants to be the control
          // program
        } else {
          controlProgram = item;
        }
      }

      // Add to list
      programs.push({
        type: attrsJson.type || "server",
        name: item,
        path: path.join(programsDir, item),
        client: attrsJson.client,
        attrsJsonRelPath: attrsJsonRelPath
      });
    });

    if (! controlProgram) {
      if (_.has(targets, 'ctl')) {
        buildmessage.error(
          "A program named ctl exists but no program has isControlProgram set");
        // recover by not making a control program
      }  else {
        var target = makeServerTarget("ctl");
        targets["ctl"] = target;
        controlProgram = "ctl";
      }
    }

    // Step 2: sort the list so that client programs are built first (because
    // when we build the servers we need to be able to reference the clients)
    programs.sort(function (a, b) {
      a = (a.type === "client") ? 0 : 1;
      b = (b.type === "client") ? 0 : 1;
      return a > b;
    });

    // Step 3: build the programs
    var blankClientTarget = null;
    _.each(programs, function (p) {
      // Read this directory as a package and create a target from
      // it
      library.override(p.name, p.path);
      var target;
      switch (p.type) {
      case "server":
        target = makeServerTarget(p.name);
        break;
      case "traditional":
        var clientTarget;

        if (! p.client) {
          if (! blankClientTarget) {
            clientTarget = blankClientTarget = targets._blank =
              makeBlankClientTarget();
          } else {
            clientTarget = blankClientTarget;
          }
        } else {
          clientTarget = targets[p.client];
          if (! clientTarget) {
            buildmessage.error("no such program '" + p.client + "'",
                               { file: p.attrsJsonRelPath });
            // recover by ignoring target
            return;
          }
        }

        // We don't check whether targets[p.client] is actually a
        // ClientTarget. If you want to be clever, go ahead.

        target = makeServerTarget(p.name, clientTarget);
        break;
      case "client":
        target = makeClientTarget(p.name);
        break;
      default:
        buildmessage.error(
          "type must be 'server', 'traditional', or 'client'",
          { file: p.attrsJsonRelPath });
        // recover by ignoring target
        return;
      };
      library.removeOverride(p.name);
      targets[p.name] = target;
    });

    // If we omitted a target due to an error, we might not have a
    // controlProgram anymore.
    if (! (controlProgram in targets))
      controlProgram = undefined;

    // Make sure notice when somebody adds a package to the app packages dir
    // that may override a warehouse package.
    library.watchLocalPackageDirs(watchSet);

    // Write to disk
    starResult = writeSiteArchive(targets, outputPath, {
      nodeModulesMode: nodeModulesMode,
      builtBy: builtBy,
      controlProgram: controlProgram,
      releaseName: releaseName
    });
    watchSet.merge(starResult.watchSet);

    success = true;
  });

  if (success && messages.hasMessages())
    success = false; // there were errors

  return {
    errors: success ? false : messages,
    watchSet: watchSet,
    starManifest: starResult && starResult.starManifest
  };
};

// Make a JsImage object (a complete, linked, ready-to-go JavaScript
// program). It can either be loaded into memory with load(), which
// returns the `Package` object inside the plugin's namespace, or
// saved to disk with write(builder).
//
// Returns an object with keys:
// - image: The created JsImage object.
// - watchSet: Source file WatchSet (see bundle()).
//
// XXX return an 'errors' key for symmetry with bundle(), rather than
// letting exceptions escape?
//
// options:
// - library: required. the Library for resolving package dependencies
// - name: required. a name for this image (cosmetic, but will appear
//   in, eg, error messages) -- technically speaking, this is the name
//   of the package created to contain the sources and package
//   dependencies set up below
// - use: list of packages to use in the plugin, as strings (foo or foo.bar)
// - sources: source files to use (paths on local disk)
// - sourceRoot: path relative to which sources should be
//   interpreted. please set it to something reasonable so that any error
//   messages will look pretty.
// - npmDependencies: map from npm package name to required version
// - npmDir: where to keep the npm cache and npm version shrinkwrap
//   info. required if npmDependencies present.
//
// XXX currently any symbols exported by the plugin will get mapped
// into 'Package.<plugin name>' within the plugin, so name should not
// be the name of any package that is included (directly or
// transitively) in the plugin build. obviously this is unfortunate.
// It would be nice to have a way to say "make this package anonymous"
// without also saying "make its namespace the same as the global
// namespace." It should be an easy refactor,
exports.buildJsImage = function (options) {
  if (options.npmDependencies && ! options.npmDir)
    throw new Error("Must indicate .npm directory to use");
  if (! options.name)
    throw new Error("Must provide a name");

  var pkg = new packages.Package(options.library);

  pkg.initFromOptions(options.name, {
    sliceName: "plugin",
    use: options.use || [],
    sourceRoot: options.sourceRoot,
    sources: options.sources || [],
    serveRoot: path.sep,
    npmDependencies: options.npmDependencies,
    npmDir: options.npmDir
  });
  pkg.build();

  var target = new JsImageTarget({
    library: options.library,
    arch: archinfo.host()
  });
  target.make({ packages: [pkg] });

  return {
    image: target.toJsImage(),
    watchSet: target.getWatchSet(),
    pluginProviderPackageDirs: target.getPluginProviderPackageDirs()
  };
};

// Load a JsImage from disk (that was previously written by calling
// write() on a JsImage). `controlFilePath` is the path to the control
// file (eg, program.json).
exports.readJsImage = function (controlFilePath) {
  return JsImage.readFromDisk(controlFilePath);
};
