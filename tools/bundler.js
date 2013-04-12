// == Site Archive (*.star) file layout (subject to rapid change) ==
//
// /star.json
//
//  - version: "1" for this format
//
//  - builtBy: human readable banner (eg, "Meteor 0.6.0")
//
//  - programs: array of programs in the star, each an object:
//    - name: short, unique name for program, for referring to it
//      programmatically
//    - arch: architecture that this program targets. Currently it is
//            "client" or "server" but in the future this will change
//            to something like "browser.w3c" or "darwin.x86_64".
//    - path: directory (relative to star.json) containing this program
//
//    XXX in the future this will also contain instructions for
//    mounting packages into the namespace of each program, and
//    possibly for mounting programs on top of each other (this would
//    be the principled mechanism by which a server program could read
//    a client program so it can server it)
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
// == Format of a program when arch is "client" ==
//
// Standard:
//
// /program.json
//
//  - version: "1" for this format
//
//  - page: path to the template for the HTML to serve when a browser
//    loads a page that is part of the application. In the file
//    ##HTML_ATTRIBUTES## and ##RUNTIME_CONFIG## will be replaced with
//    appropriate values at runtime.
//
//  - manifest: array of resources to serve with HTTP, each an object:
//    - path: path of file relative to program.json
//    - where: "client"
//    - type: "js", "css", or "static"
//    - cacheable: is it safe to ask the browser to cache this file (boolean)
//    - url: relative url to download the resource, includes cache busting
//        parameter when used
//    - size: size of file in bytes
//    - hash: sha1 hash of the file contents
//    Additionally there will be an entry with where equal to
//    "internal", path equal to page (above), and hash equal to the
//    sha1 of page (before replacements.) Currently this is used to
//    trigger HTML5 appcache reloads at the right time (if the
//    'appcache' package is being used.)
//
//  - static: a path, relative to program.json, to a directory. If the
//    server is too dumb to read 'manifest', it can just serve all of
//    the files in this directory (with a relatively short cache
//    expiry time.)
//    XXX do not use this. It will go away soon.
//
//  - static_cacheable: just like 'static' but resources that can be
//    cached aggressively (cacheable: true in the manifest)
//    XXX do not use this. It will go away soon.
//
// Convention:
//
// page is 'app.html', static is 'static', and staticCacheable is
// 'static_cacheable'.
//
//
// == Format of a program when arch is "server" ==
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
//
//  - client: the client program that should be served up by HTTP,
//    expressed as a path (relative to program.json) to the *client's*
//    program.json.
//
//  - config: additional framework-specific configuration. currently:
//    - meteorRelease: the value to use for Meteor.release, if any
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

var path = require('path');
var files = require(path.join(__dirname, 'files.js'));
var packages = require(path.join(__dirname, 'packages.js'));
var linker = require(path.join(__dirname, 'linker.js'));
var Builder = require(path.join(__dirname, 'builder.js'));
var fs = require('fs');
var uglify = require('uglify-js');
var cleanCSS = require('clean-css');
var _ = require('underscore');
var project = require(path.join(__dirname, 'project.js'));
var builder = require(path.join(__dirname, 'builder.js'));

// files to ignore when bundling. node has no globs, so use regexps
var ignoreFiles = [
    /~$/, /^\.#/, /^#.*#$/,
    /^\.DS_Store$/, /^ehthumbs\.db$/, /^Icon.$/, /^Thumbs\.db$/,
    /^\.meteor$/, /* avoids scanning N^2 files when bundling all packages */
    /^\.git$/ /* often has too many files to watch */
];

// http://davidshariff.com/blog/javascript-inheritance-patterns/
var inherits = function (child, parent) {
  var tmp = function () {};
  tmp.prototype = parent.prototype;
  child.prototype = new tmp;
  child.prototype.constructor = child;
};

///////////////////////////////////////////////////////////////////////////////
// File
///////////////////////////////////////////////////////////////////////////////

// Allowed options:
// - data: contents of the file as a Buffer
// - cacheable
var File = function (options) {
  var self = this;

  if (options.data && ! (options.data instanceof Buffer)) {
    throw new Error('File contents must be provided as a Buffer');
  }

  // The absolute path in the filesystem from which we loaded (or will
  // load) this file (null if the file does not correspond to one on
  // disk.)
  self.sourcePath = null;

  // Where this file is intended to reside within the target's
  // filesystem.
  self.targetPath = null;

  // The URL at which this file is intended to be served, relative to
  // the base URL at which the target is being served (ignored if this
  // file is not intended to be served over HTTP.)
  self.url = null

  // Is this file guaranteed to never change, so that we can let it be
  // cached forever? Only makes sense of self.url is set.
  self.cacheable = options.cacheable || false;

  // The node_modules directory that Npm.require() should search when
  // called from inside this file, given as a path in the target's
  // filesystem. Only works in the "server" architecture.
  self.nodeModulesTargetPath = null;

  self._contents = options.data || null; // contents, if known, as a Buffer
  self._hash = null; // hash, if known, as a hex string
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
      if (! self.sourcePath)
        throw new Error("Have neither contents nor sourcePath for file");
      else
        self._contents = fs.readFileSync(self.sourcePath);
    }

    return encoding ? self._contents.toString(encoding) : self._contents;
  },

  size: function () {
    var self = this;
    return self.contents().length;
  },

  // Set the URL of this file to "/<hash><suffix>". suffix will
  // typically be used to pick a reasonable extension. Also set
  // cacheable to true, since the file's name is now derived from its
  // contents.
  setUrlToHash: function (suffix) {
    var self = this;
    self.url = "/" + self.hash() + suffix;
    self.cacheable = true;
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
    var self = this
    var url = relPath.split(path.sep).join('/');

    if (url.charAt(0) !== '/')
      url = '/' + url;

    self.url = url;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Target
///////////////////////////////////////////////////////////////////////////////

// options:
// - arch: the architecture to build
//
// see subclasses for additional options
var Target = function (name, options) {
  var self = this;

  // Package library to use for resolving package dependenices.
  self.library = options.library;

  // A name for this target.
  self.name = name;

  // Path of this target in the bundle, relative to the root of the bundle.
  self.pathInBundle = path.join('programs', self.name);

  // Should be "client" or "server" for now, but soon we will get rid
  // of that and instead have something more like "browser.w3c" or
  // "nodejs.linux.i686".
  self.arch = options.arch;

  // All of the Slices that are to go into this target, in the order
  // that they are to be loaded.
  self.slices = [];

  // JavaScript files. List of File. They will be loaded at startup in
  // the order given.
  self.js = [];

  // Files and paths used by this target, in the format used by
  // watch.Watcher.
  self.dependencyInfo = {files: {}, directories: {}};
};

_.extend(Target.prototype, {
  // Determine the packages to load, create Slices for
  // them, put them in load order, save in slices.
  //
  // options include:
  // - packages: an array of packages whose default slices should be
  //   included
  // - test: an array of packages whose test slices should be included
  //
  // In both cases you can pass either package names or Package
  // objects.
  determineLoadOrder: function (options) {
    var self = this;
    var library = self.library;

    var get = function (packageOrPackageName) {
      var pkg = library.get(packageOrPackageName);
      if (! pkg) {
        console.error("Package not found: " + packageOrPackageName);
        process.exit(1);
      }
      return pkg;
    };

    // Each of these are map from slice.id to Slice
    var needed = {}; // Slices that we still need to add
    var done = {}; // Slices that are already in self.slices
    var onStack = {}; // Slices that we're in the process of adding

    // Find the roots
    var rootSlices =
      _.flatten([
        _.map(options.packages || [], function (pkg) {
          return get(pkg).getDefaultSlices(self.arch);
        }),
        _.map(options.test || [], function (pkg) {
          return get(pkg).getTestSlices(self.arch);
        })
      ]);
    _.each(rootSlices, function (slice) {
      needed[slice.id] = slice;
    });

    // Set self.slices to be all of the roots, plus all of their
    // dependencies, in the correct load order. "Load order" means
    // that if X depends on (uses) Y, and that relationship is not
    // marked as unordered, Y appears before X in the ordering. Raises
    // an exception iff there is no such ordering (due to circular
    // dependency.)
    while (true) {
      // Get an arbitrary slice from those that remain, or break if
      // none remain
      var first = null;
      for (first in needed) break;
      if (! first)
        break;
      first = needed[first];

      // Add its strong dependencies to the order, then add it. Add
      // its weak dependencies to the list of things to add later.
      var add = function (slice) {
        if (done[slice.id])
          return;

        _.each(slice.uses, function (u) {
          _.each(library.getSlices(u.spec, self.arch), function (usedSlice) {
            if (u.unordered) {
              needed[usedSlice.id] = usedSlice;
              return;
            }
            if (onStack[usedSlice.id]) {
              console.error("fatal: circular dependency between packages " +
                            slice.pkg.name + " and " + usedSlice.pkg.name);
              process.exit(1);
            }
            onStack[usedSlice.id] = true;
            add(usedSlice);
            delete onStack[usedSlice.id];
          });
        });
        self.slices.push(slice);
        done[slice.id] = true;
        delete needed[slice.id];
      };
      add(first);
    }
  },

  // Sort the slices in dependency order, then, slice by slice, write
  // their resources into the bundle (which includes running the
  // JavaScript linker.)
  emitResources: function () {
    var self = this;

    // Copy their resources into the bundle in order
    _.each(self.slices, function (slice) {
      var isApp = ! slice.pkg.name;

      // Emit the resources
      _.each(slice.getResources(), function (resource) {
        if (_.contains(["js", "css", "static"], resource.type)) {
          if (resource.type === "css" && self.arch !== "client")
            // XXX might be nice to throw an error here, but then we'd
            // have to make it so that packages.js ignores css files
            // that appear in the server directories in an app tree

            // XXX XXX can't we easily do that in the css handler in
            // meteor.js?
            return;

          var f = new File({
            data: resource.data,
            cacheable: false
          });

          if (self.arch === "client")
            f.setUrlFromRelPath(resource.servePath);
          else {
            // XXX hack
            if (resource.servePath.match(/^\/packages\//))
              f.targetPath = resource.servePath;
            else
              f.targetPath = path.join('/app', resource.servePath);
          }

          if (self.arch === "server" && resource.type === "js" && ! isApp)
            f.nodeModulesTargetPath = path.join('/npm', slice.pkg.name,
                                                slice.sliceName);

          self[resource.type].push(f);
          return;
        }

        if (_.contains(["head", "body"], resource.type)) {
          if (self.arch !== "client")
            throw new Error("HTML segments can only go to the client");
          self[resource.type].push(resource.data);
          return;
        }

        throw new Error("Unknown type " + resource.type);
      });

      // Depend on the source files that produced these
      // resources. (Since the dependencyInfo.directories should be
      // disjoint, it should be OK to merge them this way.)
      _.extend(self.dependencyInfo.files,
               slice.dependencyInfo.files);
      _.extend(self.dependencyInfo.directories,
               slice.dependencyInfo.directories);
    });
  },

  // Minify the JS in this target
  minifyJs: function () {
    var self = this;

    var allJs = _.map(self.js, function (file) {
      return file.contents('utf8');
    }).join('\n;\n');

    allJs = uglify.minify(allJs, {
      fromString: true,
      compress: {drop_debugger: false}
    }).code;

    self.js = [new File({ data: new Buffer(allJs, 'utf8') })];
    self.js[0].setUrlToHash(".js");
  },

  // For each resource of the given type, make it cacheable by adding
  // a query string to the URL based on its hash.
  addCacheBusters: function (type) {
    var self = this;
    _.each(self[type], function (file) {
      file.addCacheBuster();
    });
  },

  // Return all dependency info for this target, in the format
  // expected by watch.Watcher.
  getDependencyInfo: function () {
    var self = this;
    return self.dependencyInfo;
  }

});


//////////////////// ClientTarget ////////////////////

var ClientTarget = function (name, options) {
  var self = this;
  Target.apply(this, arguments);

  // CSS files. List of File. Applicable only on 'client'
  // architecture. They will be loaded at page load in the order
  // given.
  self.css = [];

  // Static assets to serve with HTTP. List of File. Applicable only
  // on 'client' architecture.
  self.static = [];

  // List of segments of additional HTML for <head>/<body>. Only for
  // "client" arch.
  self.head = [];
  self.body = [];
};

inherits(ClientTarget, Target);

_.extend(ClientTarget.prototype, {
  // Minify the JS in this target
  minifyCss: function () {
    var self = this;

    var allCss = _.map(self.css, function (file) {
      return file.contents('utf8');
    }).join('\n');

    allCss = cleanCSS.process(allCss);

    self.css = [new File({ data: new Buffer(allCss, 'utf8') })];
    self.css[0].setUrlToHash(".css");
  },

  // Add all of the files in a directory `rootDir` (and its
  // subdirectories) as static assets. `rootDir` should be an absolute
  // path. Only makes sense on clients. If provided, exclude is an
  // array of filename regexps to exclude. If provided, assetPath is a
  // prefix to use when computing the path for each file in the
  // client's asset tree.
  addAssetDir: function (rootDir, exclude, assetPathPrefix) {
    var self = this;
    exclude = exclude || [];

    if (self.arch !== "client")
      throw new Error("Only clients can have assets");

    self.dependencyInfo.directories[dir] = {
      include: [/.?/],
      exclude: exclude
    };

    var walk = function (dir, assetPath) {
      _.each(fs.readdirSync(dir), function (item) {
        // Skip excluded files
        var matchesAnExclude = _.any(exclude, function (pattern) {
          return item.match(pattern);
        });
        if (matchesAnExclude)
          return;

        var absPath = path.resolve(dir, item);
        assetPath = path.join(dir, item);
        if (fs.statSync(absPath).isDirectory()) {
          walk(absPath, assetPath);
          return;
        }

        var f = new File({ sourcePath: absPath });
        f.setUrlFromRelPath(assetPath);
        self.dependencyInfo.files[absPath] = f.hash();
        self.static.push(f);
      });
    };

    walk(rootDir, assetPathPrefix || '');
  },

  assignTargetPaths: function () {
    var self = this;
    _.each(["js", "css", "static"], function (type) {
      _.each(self[type], function (file) {
        if (! file.targetPath) {
          if (! file.url)
            throw new Error("Client file with no URL?");

          var parts = file.url.replace(/\?.*$/, '').split('/').slice(1);
          parts.unshift(file.cacheable ? "static_cacheable" : "static");
          file.targetPath = path.sep + path.join.apply(path, parts);
        }
      });
    });
  },

  generateHtmlBoilerplate: function () {
    var self = this;

    var templatePath = path.join(__dirname, "app.html.in");
    var template = fs.readFileSync(templatePath);
    self.dependencyInfo.files[templatePath] = Builder.sha1(template);

    var f = require('handlebars').compile(template.toString());
    return new Buffer(f({
      scripts: _.pluck(self.js, 'url'),
      stylesheets: _.pluck(self.css, 'url'),
      head_extra: self.head.join('\n'),
      body_extra: self.body.join('\n')
    }), 'utf8');
  },

  // Output the finished target to disk
  write: function (builder) {
    var self = this;
    var manifest = [];

    // Resources served via HTTP
    _.each(["js", "css", "static"], function (type) {
      _.each(self[type], function (file) {

        if (! file.targetPath)
          throw new Error("No targetPath?");

        // XXX should probably use sanitize: true, but that will have
        // to wait until the server is actually driven by the manifest
        // (rather than just serving all of the files in a certain
        // directories)
        var contents = file.contents();
        if (! (contents instanceof Buffer))
          throw new Error("contents not a Buffer");
        builder.write(file.targetPath, { data: file.contents() });

        manifest.push({
          path: file.targetPath,
          where: "client",
          type: type,
          cacheable: file.cacheable,
          url: file.url,
          size: file.size(),
          hash: file.hash()
        });
      });
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
      version: "1",
      manifest: manifest,
      page: 'app.html',

      // XXX the following are for use by 'legacy' (read: current)
      // server.js implementations which aren't smart enough to read
      // the manifest and instead want all of the resources in a
      // directory together so they can just point gzippo at it. we
      // should remove this and make the server work from the
      // manifest.
      static: 'static',
      staticCacheable: 'static_cacheable'
    });
  }
});


//////////////////// ServerTarget ////////////////////

// options:
// - clientTarget: the ClientTarget to serve up over HTTP as our client
// - releaseStamp: the Meteor release name (for retrieval at runtime)
var ServerTarget = function (name, options) {
  var self = this;
  Target.apply(this, arguments);

  // These directories are copied (cp -r) or symlinked into the
  // bundle. Map from targetPath (path in the Target's filesystem) to
  // sourcePath (absolute path in the local filesystem.)
  self.nodeModulesDirs = {};

  self.clientTarget = options.clientTarget;
  self.releaseStamp = options.releaseStamp;
};

inherits(ServerTarget, Target);

_.extend(ServerTarget.prototype, {
  // Output the finished target to disk
  write: function (builder, nodeModulesMode) {
    var self = this;

    var json = {
      load: [],
      client: path.join(path.relative(self.pathInBundle,
                                      self.clientTarget.pathInBundle),
                        'program.json'),
      config: {
        meteorRelease: self.releaseStamp && self.releaseStamp !== "none" ?
          self.releaseStamp : undefined
      }
    };

    // JavaScript sources
    _.each(self.js, function (file) {
      if (! file.targetPath)
        throw new Error("No targetPath?");

      builder.write(file.targetPath, { data: file.contents() });

      json.load.push({
        path: file.targetPath,
        node_modules: file.nodeModulesTargetPath || undefined
      });
    });

    // Server driver
    var serverPath = path.join(__dirname, 'server');
    builder.copyDirectory({
      from: serverPath,
      to: '/',
      ignore: ignoreFiles
    });

    // Main, architecture-dependent node_modules from the dependency
    // kit. This one is copied in 'meteor bundle', symlinked in
    // 'meteor run', and omitted by 'meteor deploy' (Galaxy provides a
    // version that's appropriate for the server architecture.)
    if (nodeModulesMode !== "skip") {
      builder.copyDirectory({
        from: path.join(files.get_dev_bundle(), 'lib', 'node_modules'),
        to: 'node_modules',
        ignore: ignoreFiles,
        depend: false
      });
    }

    // Extra user-defined arch-independent node_module. 'meteor
    // bundle' and 'meteor deploy' copy them, and 'meteor run'
    // symlinks them. (XXX Note that this doesn't work for
    // arch-specific packages. They'll just break if you deploy to a
    // different arch than you built on. We'll get to that Soon
    // Enough!)

    // XXX we should consider supporting bundle time-only npm
    // dependencies which don't need to be pushed to the server.

    _.each(self.slices, function (slice) {
      if (slice.pkg.npmDependencies) {
        // Make sure the right stuff is installed. This is slow and
        // should move to a separate package build step. However, the
        // Package object has code that will make sure we at least
        // only do it once per package.
        slice.pkg.installNpmDependencies();

        // Copy the package's npm dependencies into the bundle.
        builder.copyDirectory({
          from: path.join(slice.pkg.npmDir(), 'node_modules'),
          to: path.join('/npm', slice.pkg.name, slice.sliceName),
          depend: false
        });
      }
    });

    // Control file
    builder.writeJson('program.json', json);
  }
});


///////////////////////////////////////////////////////////////////////////////
// writeSiteArchive
///////////////////////////////////////////////////////////////////////////////

// targets is an array of Targets to include in the bundle. outputPath
// is the path of a directory that should be created to contain the
// generated site archive.
//
// Returns dependencyInfo (in the format expected by watch.Watcher)
// for all files and directories that ultimately went into the bundle.
//
// options:
// - nodeModulesMode: "skip", "symlink", "copy"
// - builtBy: vanity identification string to write into metadata
var writeSiteArchive = function (targets, outputPath, options) {
  var builder = new Builder({
    outputPath: outputPath,
    symlink: options.nodeModulesMode === "symlink"
  });

  try {
    var json = {
      version: "1",
      builtBy: options.builtBy,
      programs: []
    };

    // Write out each target
    _.each(targets, function (target) {
      target.pathInBundle = path.join('programs', target.name);
      target.write(builder.enter(target.pathInBundle), options.nodeModulesMode);
      json.programs.push({
        name: target.name,
        arch: target.arch,
        path: target.pathInBundle
      });
    });

    // Tell Galaxy what version of the dependency kit we're using, so
    // it can load the right modules. (Include this even if we copied
    // or symlinked a node_modules, since that's probably enough for
    // it to work in spite of the presence of node_modules for the
    // wrong arch.) The place we stash this is grody for temporary
    // reasons of backwards compatibility.
    builder.write(path.join('server', '.bundle_version.txt'), {
      file: path.join(files.get_dev_bundle(), '.bundle_version.txt')
    });

    // Affordances for standalone use
    var stub = new Buffer("require('./programs/server/server.js');\n", 'utf8');
    builder.write('main.js', { data: stub });

    builder.write('README', { data: new Buffer(
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
"Find out more about Meteor at meteor.com.\n",
      'utf8')});

    // Control file
    builder.writeJson('star.json', json);

    // Merge the dependencyInfo of everything that went into the
    // bundle. A naive merge like this doesn't work in general but
    // should work in this case.
    var fileDeps = {}, directoryDeps = {};
    var dependencySources = targets.concat([builder]);
    _.each(dependencySources, function (s) {
      var info = s.getDependencyInfo();
      _.extend(fileDeps, info.files);
      _.extend(directoryDeps, info.directories);
    });

    // We did it!
    builder.complete();

    return {
      files: fileDeps,
      directories: directoryDeps
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
 * Take the Meteor app in projectDir, and compile it into a bundle at
 * outputPath. outputPath will be created if it doesn't exist (it
 * will be a directory), and removed if it does exist. The release
 * version is *not* read from the app's .meteor/release file. Instead,
 * it must be passed in as an option.
 *
 * Returns an object with keys:
 * - errors: An array of strings, or falsy if bundling succeeded.
 * - dependencyInfo: Information about files and paths that were
 *   inputs into the bundle and that we may wish to monitor for
 *   changes when developing interactively. It has two keys, 'files'
 *   and 'directories', in the format expected by watch.Watcher.
 *
 * On failure ('errors' is truthy), no bundle will be output (in fact,
 * outputPath will have been removed if it existed.)
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
exports.bundle = function (appDir, outputPath, options) {
  if (!options)
    throw new Error("Must pass options");
  if (!options.nodeModulesMode)
    throw new Error("Must pass options.nodeModulesMode");
  if (!options.library)
    throw new Error("Must pass options.library");
  if (!options.releaseStamp)
    throw new Error("Must pass options.releaseStamp or 'none'");

  var library = options.library;

  var builtBy = "Meteor" + (options.releaseStamp &&
                            options.releaseStamp !== "none" ?
                            " " + options.releaseStamp : "");

  try {
    // Create targets
    var client = new ClientTarget("client", {
      library: library,
      arch: "client"
    });
    var server = new ServerTarget("server", {
      library: library,
      arch: "server",
      clientTarget: client,
      releaseStamp: options.releaseStamp
    });
    var targets = [client, server];

    // Create a Package object that represents the app
    var app = library.getForApp(appDir, ignoreFiles);

    // Populate the list of slices to load
    client.determineLoadOrder({
      packages: [app],
      test: options.testPackages || []
    });
    server.determineLoadOrder({
      packages: [app],
      test: options.testPackages || []
    });

    // Link JavaScript, put resources in load order, and copy them to
    // the bundle
    client.emitResources();
    server.emitResources();

    // Minify, if requested (only the client)
    if (options.minify) {
      client.minifyJs();
      client.minifyCss();
    }

    // Add assets from /public directory
    // XXX this should probably be part of the appDir reader
    if (files.is_app_dir(appDir)) { /* XXX what is this checking? */
      var publicDir = path.join(appDir, 'public');
      if (fs.existsSync(publicDir))
        client.addAssetDir(publicDir, ignoreFiles);
    }

    // Make client-side CSS and JS assets cacheable forever, by adding
    // a query string with a cache-busting hash.
    client.addCacheBusters("js");
    client.addCacheBusters("css");

    // Write to disk
    client.assignTargetPaths();
    var dependencyInfo = writeSiteArchive(targets, outputPath, {
      nodeModulesMode: options.nodeModulesMode,
      builtBy: builtBy
    });

    return {
      errors: false,
      dependencyInfo: dependencyInfo
    };
  } catch (err) {
    return {
      errors: ["Exception while bundling application:\n" + (err.stack || err)]
    };
  }
};
