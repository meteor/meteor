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
// /server/.bundle_version.txt: contains the dev_bundle version that the meteor
//   deploy server reads in order to set NODE_PATH to point to arch-specific
//   builds of binary node modules
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
// == Format of a program when arch is "web.*" ==
//
// Standard:
//
// /program.json
//
//  - format: "web-program-pre1" for this version
//
//  - manifest: array of resources to serve with HTTP, each an object:
//    - path: path of file relative to program.json
//    - where: "client"
//    - type: "js", "css", or "asset"
//    - cacheable: is it safe to ask the client to cache this file (boolean)
//    - url: relative url to download the resource, includes cache busting
//        parameter when used
//    - size: size of file in bytes
//    - hash: sha1 hash of the file contents
//    - sourceMap: optional path to source map file (relative to program.json)
//
//    Additionally there may be a manifest entry with where equal to
//    "internal", type "head" or "body", and a path and hash. These contain
//    chunks of HTML which should be inserted in the boilerplate HTML page's
//    <head> or <body> respectively.
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
// /npm/foo/node_modules: node_modules for package foo. may be symlinked
//     if developing locally.
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

var assert = require('assert');
var util = require('util');
var Fiber = require('fibers');
var _ = require('underscore');

var compiler = require('./compiler.js');
var PackageSource = require('./package-source.js');
import Builder from './builder.js';
var compilerPluginModule = require('./compiler-plugin.js');
import { JsFile, CssFile } from './minifier-plugin.js';
var meteorNpm = require('./meteor-npm.js');
import { addToTree } from "./linker.js";

var files = require('../fs/files.js');
var archinfo = require('../utils/archinfo.js');
var buildmessage = require('../utils/buildmessage.js');
var watch = require('../fs/watch.js');
var colonConverter = require('../utils/colon-converter.js');
var Profile = require('../tool-env/profile.js').Profile;
var packageVersionParser = require('../packaging/package-version-parser.js');
var release = require('../packaging/release.js');
import { loadIsopackage } from '../tool-env/isopackets.js';
import { CORDOVA_PLATFORM_VERSIONS } from '../cordova';
import { gzipSync } from "zlib";
import { PackageRegistry } from "../../packages/meteor/define-package.js";

const SOURCE_URL_PREFIX = "meteor://\u{1f4bb}app";

// files to ignore when bundling. node has no globs, so use regexps
exports.ignoreFiles = [
    /~$/, /^\.#/,
    /^(\.meteor\/|\.git\/|Thumbs\.db|\.DS_Store\/?|Icon\r|ehthumbs\.db|\..*\.sw.|#.*#)$/,
      /* .meteor => avoids scanning N^2 files when bundling all packages
        .git => often has too many files to watch
        ....sw(.) => vim swap files
        #.*# => emacs swap files
      */
];

function rejectBadPath(p) {
  if (p.startsWith("..")) {
    throw new Error("bad path: " + p);
  }
}

var stripLeadingSlash = function (p) {
  if (p.charAt(0) === '/') {
    return p.slice(1);
  }

  return p;
};


// Contents of main.js in bundles. Exported for use by the bundler
// tests.
exports._mainJsContents = [
  "",
  "process.argv.splice(2, 0, 'program.json');",
  "process.chdir(require('path').join(__dirname, 'programs', 'server'));",
  "require('./programs/server/boot.js');",
].join("\n");

///////////////////////////////////////////////////////////////////////////////
// NodeModulesDirectory
///////////////////////////////////////////////////////////////////////////////

// Represents a node_modules directory that we need to copy into the
// bundle or otherwise make available at runtime.

export class NodeModulesDirectory {
  constructor({
    packageName,
    sourceRoot,
    sourcePath,
    preferredBundlePath,
    local = false,
    npmDiscards = null,
  }) {
    // Name of the package this node_modules directory belongs to, or null
    // if it belongs to an application.
    assert.ok(typeof packageName === "string" || packageName === null);
    this.packageName = packageName;

    // The absolute path of the root directory of the app or package that
    // contains this node_modules directory.
    assert.strictEqual(typeof sourceRoot, "string");
    this.sourceRoot = sourceRoot;

    // The absolute path (on local disk) to a directory that contains
    // the built node_modules to use.
    assert.strictEqual(typeof sourcePath, "string");
    this.sourcePath = sourcePath;

    // The path (relative to the bundle root) where we would preferably
    // like the node_modules to be output.
    this.preferredBundlePath = preferredBundlePath;

    // Boolean indicating whether the node_modules directory is locally
    // accessible from other modules in the app or package.
    this.local = !! local;

    // A test package often shares its .sourcePath with the non-test
    // package, so it's important to be able to tell them apart,
    // especially when we'd like to treat .sourcePath as a unique key.
    this.isTestPackage =
      typeof packageName === "string" &&
      /^local-test[:_]/.test(packageName);

    // Optionally, files to discard.
    this.npmDiscards = npmDiscards;
  }

  copy() {
    return new this.constructor(this);
  }

  isPortable() {
    return meteorNpm.dependenciesArePortable(this.sourcePath);
  }

  rebuildIfNonPortable() {
    return meteorNpm.rebuildIfNonPortable(this.sourcePath);
  }

  getPreferredBundlePath(kind) {
    assert.ok(kind === "bundle" ||
              kind === "isopack",
              kind);

    let relPath = files.pathRelative(this.sourceRoot, this.sourcePath);
    rejectBadPath(relPath);

    const isApp = ! this.packageName;
    if (! isApp) {
      const relParts = relPath.split(files.pathSep);
      const name = colonConverter.convert(
        this.packageName.replace(/^local-test[:_]/, ""));

      if (relParts[0] === ".npm") {
        // Normalize .npm/package/node_modules/... paths so that they get
        // copied into the bundle as if they were in the top-level local
        // node_modules directory of the package.
        if (relParts[1] === "package") {
          relParts.splice(0, 2);
        } else if (relParts[1] === "plugin") {
          relParts.splice(0, 3);
        }
      } else if (relParts[0] === "npm") {
        // The npm/ at the beginning of the relPath was probably added by
        // a previous call to getPreferredBundlePath, so we remove it here
        // to avoid duplication.
        let spliceCount = 1;
        if (relParts[1] === "node_modules" &&
            relParts[2] === "meteor" &&
            relParts[3] === name) {
          // Same with node_modules/meteor/<package name>/, which was
          // almost certainly added by the code immediately below.
          spliceCount += 3;
        }
        relParts.splice(0, spliceCount);
      }

      if (kind === "bundle") {
        relParts.unshift("node_modules", "meteor", name);
      }

      let lastPart = relParts.pop();
      if (lastPart !== "node_modules") {
        // Sometimes when building an app bundle for a different
        // architecture, the isopacket source directory ends up with
        // different npm/node_modules directories for each architecture,
        // distinguished by numerical suffixes (e.g. npm/node_modules1).
        // While this is important to keep the built binary files
        // distinct, we definitely don't want node_modules1 to show up in
        // the final build.
        assert.ok(lastPart.startsWith("node_modules"), lastPart);
        lastPart = "node_modules";
      }
      relParts.push(lastPart);

      relPath = files.pathJoin(...relParts);
    }

    // It's important not to put node_modules at the top level, so that it
    // will not be visible from within plugins.
    return files.pathJoin("npm", relPath);
  }

  toJSON() {
    return {
      packageName: this.packageName,
      local: this.local,
    };
  }

  // Returns an object mapping from relative bundle paths to the kind of
  // objects returned by the toJSON method above. Note that this works
  // even if the node_modules parameter is a string, though that will only
  // be the case for bundles built before Meteor 1.3.
  static readDirsFromJSON(node_modules, {
    rebuildBinaries = false,
    // Options consumed by readDirsFromJSON are listed above. Any other
    // options will be passed on to NodeModulesDirectory constructor via
    // this callerInfo object:
    ...callerInfo
  }) {
    assert.strictEqual(typeof callerInfo.sourceRoot, "string");

    const nodeModulesDirectories = Object.create(null);

    function add(moreInfo, path) {
      const info = {
        ...callerInfo,
        ...moreInfo,
      };

      if (! info.packageName) {
        const parts = path.split("/");

        if (parts[0] === "npm" &&
            parts[1] === "node_modules" &&
            parts[2] === "meteor") {
          info.packageName = parts[3];

        } else if (parts.length === 3 &&
                   parts[0] === "npm" &&
                   parts[2] === "node_modules") {
          info.packageName = parts[1];

        } else {
          parts.some(function (part, i) {
            if (i > 0 && part === ".npm") {
              if (parts[i + 1] === "package") {
                info.packageName = parts[i - 1];
                return true;
              }

              if (parts[i + 1] === "plugin") {
                info.packageName = parts[i + 2];
                return true;
              }
            }
          });
        }

        if (! info.packageName) {
          throw new Error("No package name inferred from " + path);
        }
      }

      if (files.pathIsAbsolute(path)) {
        info.sourcePath = path;
      } else {
        rejectBadPath(path);
        info.sourcePath = files.pathJoin(callerInfo.sourceRoot, path);
      }

      nodeModulesDirectories[info.sourcePath] =
        new NodeModulesDirectory(info);
    }

    if (typeof node_modules === "string") {
      // Old-style node_modules strings were only ever for
      // .npm/package/node_modules directories, which are non-local.
      add({ local: false }, node_modules);
    } else if (node_modules) {
      _.each(node_modules, add);
    }

    if (rebuildBinaries) {
      _.each(nodeModulesDirectories, (info, path) => {
        meteorNpm.rebuildIfNonPortable(path);
      });
    }

    return nodeModulesDirectories;
  }

  // Returns a predicate function that determines if a given directory is
  // contained by a production package directory in this.sourcePath.
  getProdPackagePredicate() {
    if (this._prodPackagePredicate) {
      return this._prodPackagePredicate;
    }

    const sourcePath = this.sourcePath;
    const prodPackageNames = meteorNpm.getProdPackageNames(sourcePath);
    if (! prodPackageNames) {
      // Indicates that no directories should be excluded from the set of
      // production packages. Equivalent to returning dir => true.
      return null;
    }

    const prodPackageTree = Object.create(null);
    const complete = Symbol();
    let maxPartCount = 0;

    Object.keys(prodPackageNames).forEach(name => {
      const parts = name.split("/");
      let tree = prodPackageTree;

      parts.forEach(part => {
        tree = tree[part] || (tree[part] = Object.create(null));
      });

      tree[complete] = true;
      maxPartCount = Math.max(parts.length, maxPartCount);
    });

    return this._prodPackagePredicate = function isWithinProdPackage(path) {
      const parts = files.pathRelative(sourcePath, path)
        .split(files.pathSep);

      // Normalize away trailing files.pathSep characters.
      while (parts[parts.length - 1] === "") {
        parts.pop();
      }

      const start = parts.lastIndexOf("node_modules") + 1;

      if (start >= parts.length) {
        // If "node_modules" is the final part, then there's nothing
        // futher to examine, yet.
        return true;
      }

      if (parts[start] === ".bin") {
        if (start === parts.length - 1) {
          // Permit node_modules/.bin directories, so that we can filter
          // their contents below.
          return true;
        }

        const real = files.realpathOrNull(path);
        if (typeof real === "string" &&
            real !== path) {
          // If node_modules/.bin/command is a symlink, determine the
          // answer by calling isWithinProdPackage(real).
          return isWithinProdPackage(real);
        }

        // If node_modules/.bin/command is not a symlink, then it's hard
        // to tell which package is responsible for it, so don't strip it.
        return true;
      }

      // Strip away any parts not related to the package name.
      parts.length = Math.min(start + maxPartCount, parts.length);

      let tree = prodPackageTree;

      for (let pos = start; pos < parts.length; ++pos) {
        const part = parts[pos];
        const branch = tree[part];

        if (! branch) {
          // This dir is not prefixed by a production package name.
          return false;
        }

        if (branch[complete]) {
          // This dir is prefixed by a complete production package name.
          break;
        }

        tree = branch;
      }

      return true;
    };
  }
}

///////////////////////////////////////////////////////////////////////////////
// File
///////////////////////////////////////////////////////////////////////////////

// Allowed options:
// - sourcePath: path to file on disk that will provide our contents
// - data: contents of the file as a Buffer
// - hash: optional, sha1 hash of the file contents, if known
// - sourceMap: if 'data' is given, can be given instead of
//   sourcePath. a string or a JS Object. Will be stored as Object.
// - cacheable
class File {
  constructor (options) {
    if (options.data && ! (options.data instanceof Buffer)) {
      throw new Error('File contents must be provided as a Buffer');
    }
    if (! options.sourcePath && ! options.data) {
      throw new Error("Must provide either sourcePath or data");
    }

    // The absolute path in the filesystem from which we loaded (or will
    // load) this file (null if the file does not correspond to one on
    // disk).
    this.sourcePath = options.sourcePath;

    // info is just for help with debugging the tool; it isn't written to disk or
    // anything.
    this.info = options.info || '?';

    // If this file was generated, a sourceMap (as a string) with debugging
    // information, as well as the "root" that paths in it should be resolved
    // against. Set with setSourceMap.
    this.sourceMap = null;
    this.sourceMapRoot = null;

    // Where this file is intended to reside within the target's
    // filesystem.
    this.targetPath = null;

    // The URL at which this file is intended to be served, relative to
    // the base URL at which the target is being served (ignored if this
    // file is not intended to be served over HTTP).
    this.url = null;

    // A prefix that will be prepended to this.url.
    // Prefixing is currently restricted to web.cordova URLs.
    if (options.arch.startsWith("web.") &&
        // Using the isModern function from the modern-browsers package,
        // the webapp and dynamic-import packages can automatically
        // determine whether a client should receive resources from the
        // web.browser or web.browser.legacy architecture, so those
        // architectures do not need a URL prefix. Other architectures,
        // such as web.cordova, still need a prefix like /__cordova/.
        options.arch !== "web.browser" &&
        options.arch !== "web.browser.legacy") {
      this.urlPrefix = "/__" +
        options.arch.split(".").slice(1).join(".");
    } else {
      this.urlPrefix = "";
    }

    // Is this file guaranteed to never change, so that we can let it be
    // cached forever? Only makes sense of self.url is set.
    this.cacheable = options.cacheable || false;

    // The node_modules directories that Npm.require() should search when
    // called from inside this file. Only includes non-local node_modules
    // directories (e.g. .npm/package/node_modules), and only works on the
    // server architecture.
    this.nodeModulesDirectories = Object.create(null);

    // For server JS only. Assets associated with this slice; map from the path
    // that is the argument to Assets.getBinary, to a Buffer that is its contents.
    this.assets = null;

    this._contents = options.data || null; // contents, if known, as a Buffer
    this._hashOfContents = options.hash || null;
    this._hash = null;
  }

  toString() {
    return `File: [info=${this.info}]`;
  }

  static _salt() {
    // Increment this number to force rehashing.
    return 2;
  }

  hash() {
    if (! this._hash) {
      if (! this._hashOfContents) {
        this._hashOfContents = watch.sha1(this.contents());
      }

      this._hash = watch.sha1(
        String(File._salt()),
        this._hashOfContents,
      );
    }

    return this._hash;
  }

  // Omit encoding to get a buffer, or provide something like 'utf8'
  // to get a string
  contents(encoding) {
    if (! this._contents) {
      if (! this.sourcePath) {
        throw new Error("Have neither contents nor sourcePath for file");
      } else {
        this._contents = files.readFile(this.sourcePath);
      }
    }

    return encoding ? this._contents.toString(encoding) : this._contents;
  }

  setContents(b) {
    if (!(b instanceof Buffer)) {
      throw new Error("Must set contents to a Buffer");
    }
    this._contents = b;
    // Un-cache hash.
    this._hashOfContents = this._hash = null;
  }

  size() {
    return this.contents().length;
  }

  // Set the URL (and target path) of this file to "/<hash><suffix>". suffix
  // will typically be used to pick a reasonable extension. Also set cacheable
  // to true, since the file's name is now derived from its contents.

  // Also allow a special second suffix that will *only* be postpended to the
  // url, useful for query parameters.
  setUrlToHash(fileAndUrlSuffix, urlSuffix) {
    urlSuffix = urlSuffix || "";
    this.url = this.urlPrefix + "/" +
      this.hash() + fileAndUrlSuffix + urlSuffix;
    this.cacheable = true;
    this.targetPath = this.hash() + fileAndUrlSuffix;
  }

  // Append "?<hash>" to the URL and mark the file as cacheable.
  addCacheBuster() {
    if (! this.url) {
      throw new Error("File must have a URL");
    }
    if (this.cacheable) {
      // eg, already got setUrlToHash
      return;
    }
    if (/\?/.test(this.url)) {
      throw new Error("URL already has a query string");
    }
    this.url += "?hash=" + this.hash();
    this.cacheable = true;
  }

  // Given a relative path like 'a/b/c' (where '/' is this system's
  // path component separator), produce a URL that always starts with
  // a forward slash and that uses a literal forward slash as the
  // component separator. Also optionally add browser.legacy prefix.
  setUrlFromRelPath(relPath) {
    var url = relPath;

    if (url.charAt(0) !== '/') {
      url = '/' + url;
    }

    // XXX replacing colons with underscores as colon is hard to escape later
    // on different targets and generally is not a good separator for web.
    url = colonConverter.convert(url);
    this.url = this.urlPrefix + url;
  }

  setTargetPathFromRelPath(relPath) {
    // XXX hack
    if (relPath.match(/^(packages|assets|dynamic)\//)) {
      this.targetPath = relPath;
    } else {
      this.targetPath = files.pathJoin('app', relPath);
    }

    // XXX same as in setUrlFromRelPath, we replace colons with a different
    // separator to avoid difficulties further. E.g.: on Windows it is not a
    // valid char in filename, Cordova also rejects it, etc.
    this.targetPath = colonConverter.convert(this.targetPath);
  }

  // Set a source map for this File. sourceMap is given as a string.
  setSourceMap(sourceMap, root) {
    if (sourceMap === null || ['object', 'string'].indexOf(typeof sourceMap) === -1) {
      throw new Error("sourceMap must be given as a string or an object");
    }

    if (typeof sourceMap === 'string') {
      sourceMap = JSON.parse(sourceMap);
    }

    this.sourceMap = sourceMap;
    this.sourceMapRoot = root;
  }

  // note: this assets object may be shared among multiple files!
  setAssets(assets) {
    if (!_.isEmpty(assets)) {
      this.assets = assets;
    }
  }
}

///////////////////////////////////////////////////////////////////////////////
// Target
///////////////////////////////////////////////////////////////////////////////

class Target {
  constructor({
    // for resolving package dependencies
    packageMap,
    isopackCache,

    // Path to the root source directory for this Target.
    sourceRoot,

    // the architecture to build
    arch,
    // projectContextModule.CordovaPluginsFile object
    cordovaPluginsFile,
    // 'development', 'production' or 'test'; determines whether
    // debugOnly, prodOnly and testOnly packages are included;
    // defaults to 'production'
    buildMode,
    // directory on disk where to store the cache for things like linker
    bundlerCacheDir,
    // ... see subclasses for additional options
  }) {
    this.packageMap = packageMap;
    this.isopackCache = isopackCache;

    this.sourceRoot = sourceRoot;

    // Something like "web.browser" or "os" or "os.osx.x86_64"
    this.arch = arch;

    // All of the Unibuilds that are to go into this target, in the order
    // that they are to be loaded.
    this.unibuilds = [];

    // JavaScript files. List of File. They will be loaded at startup in
    // the order given.
    this.js = [];

    // On-disk dependencies of this target.
    this.watchSet = new watch.WatchSet();

    // List of all package names used in this target.
    this.usedPackages = {};

    // node_modules directories that we need to copy into the target (or
    // otherwise make available at runtime). A map from an absolute path
    // on disk (NodeModulesDirectory.sourcePath) to a
    // NodeModulesDirectory object that we have created to represent it.
    //
    // The NodeModulesDirectory objects in this map are de-duplicated
    // aliases to the objects in the nodeModulesDirectory fields of
    // the File objects in this.js.
    this.nodeModulesDirectories = Object.create(null);

    // Static assets to include in the bundle. List of File.
    // For client targets, these are served over HTTP.
    this.asset = [];

    // The project's cordova plugins file (which lists plugins used directly by
    // the project).
    this.cordovaPluginsFile = cordovaPluginsFile;

    // A mapping from Cordova plugin name to Cordova plugin version number.
    this.cordovaDependencies = this.cordovaPluginsFile ? {} : null;

    this.buildMode = buildMode || 'production';

    this.bundlerCacheDir = bundlerCacheDir;
  }

  // Top-level entry point for building a target. Generally to build a
  // target, you create with 'new', call make() to specify its sources
  // and build options and actually do the work of buliding the
  // target, and finally you retrieve the build product with a
  // target-type-dependent function such as write() or toJsImage().
  //
  // options
  // - packages: packages to include (Isopack or 'foo'), per
  //   _determineLoadOrder
  // - minifyMode: 'development'/'production'
  // - addCacheBusters: if true, make all files cacheable by adding
  //   unique query strings to their URLs. unlikely to be of much use
  //   on server targets.
  make({packages, minifyMode, addCacheBusters, minifiers}) {
    buildmessage.assertInCapture();

    buildmessage.enterJob("building for " + this.arch, () => {
      // Populate the list of unibuilds to load
      this._determineLoadOrder({
        packages: packages || []
      });

      const sourceBatches = this._runCompilerPlugins({
        minifiers,
        minifyMode,
      });

      // Link JavaScript and set up this.js, etc.
      this._emitResources(sourceBatches);

      // Add top-level Cordova dependencies, which override Cordova
      // dependencies from packages.
      this._addDirectCordovaDependencies();

      // Minify, with mode requested.
      // Why do we only minify in client targets?
      // (a) CSS only exists in client targets, so we definitely shouldn't
      //     minify CSS in server targets.
      // (b) We don't know of a use case for standard minification on server
      //     targets (though we could imagine wanting to do other
      //     post-processing using this API).
      // (c) On the server, JS files have extra metadata associated like
      //     static assets and npm modules. We'd have to support merging
      //     the npm modules from multiple js resources (generally 1 per
      //     package) together. This isn't impossible, but not worth
      //     the implementation complexity without a use case.
      // We can always extend registerMinifier to allow server targets
      // later!
      if (this instanceof ClientTarget) {
        var minifiersByExt = {};
        ['js', 'css'].forEach(function (ext) {
          minifiersByExt[ext] = _.find(minifiers, function (minifier) {
            return minifier && _.contains(minifier.extensions, ext);
          });
        });

        if (minifiersByExt.js) {
          this.minifyJs(minifiersByExt.js, minifyMode);
        }
        if (minifiersByExt.css) {
          this.minifyCss(minifiersByExt.css, minifyMode);
        }
      }

      this.rewriteSourceMaps();

      if (addCacheBusters) {
        // Make client-side CSS and JS assets cacheable forever, by
        // adding a query string with a cache-busting hash.
        this._addCacheBusters("js");
        this._addCacheBusters("css");
      }
    });
  }

  // Determine the packages to load, create Unibuilds for
  // them, put them in load order, save in unibuilds.
  //
  // options include:
  // - packages: an array of packages (or, properly speaking, unibuilds)
  //   to include. Each element should either be a Isopack object or a
  //   package name as a string
  _determineLoadOrder({packages}) {
    buildmessage.assertInCapture();

    const isopackCache = this.isopackCache;

    buildmessage.enterJob('linking the program', () => {
      // Find the roots
      const rootUnibuilds = [];
      packages.forEach((p) => {
        if (typeof p === 'string') {
          p = isopackCache.getIsopack(p);
        }

        // `debugOnly` packages work with "debug" and "test" build
        // modes.
        if (p.debugOnly && this.buildMode === 'production') {
          return;
        }
        if (p.prodOnly && this.buildMode !== 'production') {
          return;
        }
        if (p.testOnly && this.buildMode !== 'test') {
          return;
        }
        const unibuild = p.getUnibuildAtArch(this.arch);
        unibuild && rootUnibuilds.push(unibuild);
      });

      if (buildmessage.jobHasMessages()) {
        return;
      }

      // PHASE 1: Which unibuilds will be used?
      //
      // Figure out which unibuilds are going to be used in the target,
      // regardless of order. We ignore weak dependencies here, because they
      // don't actually create a "must-use" constraint, just an ordering
      // constraint.

      // What unibuilds will be used in the target? Built in Phase 1, read in
      // Phase 2.
      const usedUnibuilds = {};  // Map from unibuild.id to Unibuild.
      this.usedPackages = {};  // Map from package name to true;
      const addToGetsUsed = function (unibuild) {
        if (_.has(usedUnibuilds, unibuild.id)) {
          return;
        }
        usedUnibuilds[unibuild.id] = unibuild;
        if (unibuild.kind === 'main') {
          // Only track real packages, not plugin pseudo-packages.
          this.usedPackages[unibuild.pkg.name] = true;
        }
        compiler.eachUsedUnibuild({
          dependencies: unibuild.uses,
          arch: this.arch,
          isopackCache: isopackCache,
          // in both "development" and "test" build modes we should
          // include `debugOnly` packages.
          skipDebugOnly: this.buildMode === 'production',
          skipProdOnly: this.buildMode !== 'production',
          skipTestOnly: this.buildMode !== 'test',
        }, addToGetsUsed);
      }.bind(this);

      rootUnibuilds.forEach(addToGetsUsed);

      if (buildmessage.jobHasMessages()) {
        return;
      }

      // PHASE 2: In what order should we load the unibuilds?
      //
      // Set this.unibuilds to be all of the roots, plus all of their non-weak
      // dependencies, in the correct load order. "Load order" means that if X
      // depends on (uses) Y, and that relationship is not marked as unordered,
      // Y appears before X in the ordering. Raises an exception iff there is no
      // such ordering (due to circular dependency).
      //
      // The topological sort code here is similar to code in isopack-cache.js,
      // though they do serve slightly different purposes: that one determines
      // build order dependencies and this one determines load order
      // dependencies.

      // What unibuilds have not yet been added to this.unibuilds?
      const needed = _.clone(usedUnibuilds);  // Map from unibuild.id to Unibuild.
      // Unibuilds that we are in the process of adding; used to detect circular
      // ordered dependencies.
      const onStack = {};  // Map from unibuild.id to true.

      // This helper recursively adds unibuild's ordered dependencies to
      // this.unibuilds, then adds unibuild itself.
      const add = function (unibuild) {
        // If this has already been added, there's nothing to do.
        if (!_.has(needed, unibuild.id)) {
          return;
        }

        // Process each ordered dependency. (If we have an unordered dependency
        // `u`, then there's no reason to add it *now*, and for all we know, `u`
        // will depend on `unibuild` and need to be added after it. So we ignore
        // those edge. Because we did follow those edges in Phase 1, any
        // unordered unibuilds were at some point in `needed` and will not be
        // left out).
        //
        // eachUsedUnibuild does follow weak edges (ie, they affect the
        // ordering), but only if they point to a package in usedPackages (ie, a
        // package that SOMETHING uses strongly).
        var processUnibuild = function (usedUnibuild) {
          if (onStack[usedUnibuild.id]) {
            buildmessage.error(
              "circular dependency between packages " +
                unibuild.pkg.name + " and " + usedUnibuild.pkg.name);
            // recover by not enforcing one of the depedencies
            return;
          }
          onStack[usedUnibuild.id] = true;
          add(usedUnibuild);
          delete onStack[usedUnibuild.id];
        };
        compiler.eachUsedUnibuild({
          dependencies: unibuild.uses,
          arch: this.arch,
          isopackCache: isopackCache,
          skipUnordered: true,
          acceptableWeakPackages: this.usedPackages,
          // in both "development" and "test" build modes we should
          // include `debugOnly` packages.
          skipDebugOnly: this.buildMode === 'production',
          skipProdOnly: this.buildMode !== 'production',
          skipTestOnly: this.buildMode !== 'test',
        }, processUnibuild);
        this.unibuilds.push(unibuild);
        delete needed[unibuild.id];
      }.bind(this);

      while (true) {
        // Get an arbitrary unibuild from those that remain, or break if none
        // remain.
        let first = null;
        for (first in needed) {
          break;
        }
        if (! first) {
          break;
        }
        // Now add it, after its ordered dependencies.
        add(needed[first]);
      }
    });
  }

  // Run all the compiler plugins on all source files in the project. Returns an
  // array of PackageSourceBatches which contain the results of this processing.
  _runCompilerPlugins({
    minifiers = [],
    minifyMode = "development",
  }) {
    buildmessage.assertInJob();

    const minifiersByExt = Object.create(null);
    if (this instanceof ClientTarget) {
      ["js", "css"].forEach(ext => {
        minifiers.some(minifier => {
          if (_.contains(minifier.extensions, ext)) {
            return minifiersByExt[ext] = minifier;
          }
        });
      });
    }

    const target = this;
    const processor = new compilerPluginModule.CompilerPluginProcessor({
      unibuilds: this.unibuilds,
      arch: this.arch,
      sourceRoot: this.sourceRoot,
      isopackCache: this.isopackCache,
      linkerCacheDir: this.bundlerCacheDir &&
        files.pathJoin(this.bundlerCacheDir, 'linker'),

      // Takes a CssOutputResource and returns a string of minified CSS,
      // or null to indicate no minification occurred.
      // TODO Cache result by resource hash?
      minifyCssResource(resource) {
        if (! minifiersByExt.css ||
            minifyMode === "development") {
          // Indicates the caller should use the original resource.data
          // without minification.
          return null;
        }

        const file = new File({
          info: 'resource ' + resource.servePath,
          arch: target.arch,
          data: resource.data,
        });

        file.setTargetPathFromRelPath(
          stripLeadingSlash(resource.servePath));

        return target.minifyCssFiles(
          [file], minifiersByExt.css, minifyMode
        ).map(file => file.contents("utf8")).join("\n");
      }
    });

    return processor.runCompilerPlugins();
  }

  // Process all of the sorted unibuilds (which includes running the JavaScript
  // linker).
  _emitResources(sourceBatches) {
    buildmessage.assertInJob();

    const isWeb = archinfo.matches(this.arch, 'web');
    const isOs = archinfo.matches(this.arch, 'os');

    const jsOutputFilesMap = compilerPluginModule.PackageSourceBatch
      .computeJsOutputFilesMap(sourceBatches);

    const versions = {};
    const dynamicImportFiles = new Set;

    // Copy their resources into the bundle in order
    sourceBatches.forEach((sourceBatch) => {
      const unibuild = sourceBatch.unibuild;

      if (this.cordovaDependencies) {
        _.each(unibuild.pkg.cordovaDependencies, (version, name) => {
          this._addCordovaDependency(
            name,
            version,
            // use newer version if another version has already been added
            false
          );
        });
      }

      const name = unibuild.pkg.name || null;
      const isApp = ! name;

      // Emit the resources
      const resources = sourceBatch.getResources(jsOutputFilesMap.get(name));

      // First, find all the assets, so that we can associate them with each js
      // resource (for os unibuilds).
      const unibuildAssets = {};
      resources.forEach((resource) => {
        if (resource.type !== 'asset') {
          return;
        }

        const fileOptions = {
          info: 'unbuild ' + resource,
          arch: this.arch,
          data: resource.data,
          cacheable: false,
          hash: resource.hash,
        };

        const file = new File(fileOptions);
        const assetFiles = [file];

        if (file.urlPrefix.length > 0) {
          const noPrefix = new File(fileOptions);
          noPrefix.urlPrefix = "";
          // If the file has a URL prefix, add another resource for this
          // asset without the prefix.
          assetFiles.push(noPrefix);
        }

        assetFiles.forEach(f => {
          const relPath = isOs
            ? files.pathJoin('assets', resource.servePath)
            : stripLeadingSlash(resource.servePath);

          f.setTargetPathFromRelPath(relPath);

          if (isWeb) {
            f.setUrlFromRelPath(resource.servePath);
          } else {
            unibuildAssets[resource.path] = resource.data;
          }

          this.asset.push(f);
        });
      });

      // Now look for the other kinds of resources.
      resources.forEach((resource) => {
        if (resource.type === 'asset') {
          // already handled
          return;
        }

        if (resource.type !== "js" &&
            resource.lazy) {
          // Only files that compile to JS can be imported, so any other
          // files should be ignored here, if lazy.
          return;
        }

        if (_.contains(['js', 'css'], resource.type)) {
          if (resource.type === 'css' && ! isWeb) {
            // XXX might be nice to throw an error here, but then we'd
            // have to make it so that package.js ignores css files
            // that appear in the server directories in an app tree

            // XXX XXX can't we easily do that in the css handler in
            // meteor.js?
            return;
          }

          const f = new File({
            info: 'resource ' + resource.servePath,
            arch: this.arch,
            data: resource.data,
            cacheable: false,
          });

          const relPath = stripLeadingSlash(resource.servePath);
          f.setTargetPathFromRelPath(relPath);

          if (isWeb) {
            f.setUrlFromRelPath(resource.servePath);
          }

          if (resource.type === 'js' && isOs) {
            // Hack, but otherwise we'll end up putting app assets on this file.
            if (resource.servePath !== '/packages/global-imports.js') {
              f.setAssets(unibuildAssets);
            }

            _.each(unibuild.nodeModulesDirectories, nmd => {
              addNodeModulesDirToObject(nmd, this.nodeModulesDirectories);
              addNodeModulesDirToObject(nmd, f.nodeModulesDirectories);
            });
          }

          // Both CSS and JS files can have source maps
          if (resource.sourceMap) {
            // XXX we used to set sourceMapRoot to
            // files.pathDirname(relPath) but it's unclear why.  With the
            // currently generated source map file names, it works without it
            // and doesn't work well with it... maybe?  we were getting
            // 'packages/packages/foo/bar.js'
            f.setSourceMap(resource.sourceMap, null);
          }

          this[resource.type].push(f);
          return;
        }

        if (_.contains(['head', 'body'], resource.type)) {
          if (! isWeb) {
            throw new Error('HTML segments can only go to the client');
          }
          this[resource.type].push(resource.data);
          return;
        }

        throw new Error('Unknown type ' + resource.type);
      });

      this.js.forEach(file => {
        if (file.targetPath === "packages/dynamic-import.js") {
          dynamicImportFiles.add(file);
        }

        if (file.targetPath.startsWith("dynamic/")) {
          addToTree(file.hash(), file.targetPath, versions);
        }
      });

      // Depend on the source files that produced these resources.
      this.watchSet.merge(unibuild.watchSet);

      // Remember the versions of all of the build-time dependencies
      // that were used in these resources. Depend on them as well.
      // XXX assumes that this merges cleanly
       this.watchSet.merge(unibuild.pkg.pluginWatchSet);
    });

    dynamicImportFiles.forEach(file => {
      file.setContents(
        Buffer.from(file.contents("utf8").replace(
          "__DYNAMIC_VERSIONS__",
          () => JSON.stringify(versions.dynamic || {})
        ), "utf8")
      );
    });
  }

  // Minify the JS in this target
  minifyJs(minifierDef, minifyMode) {
    const staticFiles = [];
    const dynamicFiles = [];
    const { arch } = this;

    this.js.forEach(file => {
      const jsf = new JsFile(file, { arch });

      if (file.targetPath.startsWith("dynamic/")) {
        // Make sure file._hash is cached.
        file.hash();

        // Dynamic files consist of a single anonymous function
        // expression, which some minifiers (e.g. UglifyJS) either fail to
        // parse or mistakenly eliminate as dead code. To avoid these
        // problems, we temporarily name the function __minifyJs.
        file._contents = Buffer.from(
          file.contents()
            .toString("utf8")
            .replace(/^\s*function\s*\(/,
                     "function __minifyJs("),
          "utf8"
        );

        dynamicFiles.push(jsf);

      } else {
        staticFiles.push(jsf);
      }
    });

    var minifier = minifierDef.userPlugin.processFilesForBundle
      .bind(minifierDef.userPlugin);

    buildmessage.enterJob('minifying app code', function () {
      try {
        var markedMinifier = buildmessage.markBoundary(minifier);
        Promise.all([
          markedMinifier(staticFiles, { minifyMode }),
          ...dynamicFiles.map(
            file => markedMinifier([file], { minifyMode })
          ),
        ]).await();
      } catch (e) {
        buildmessage.exception(e);
      }
    });

    const js = [];

    function handle(source, dynamic) {
      source._minifiedFiles.forEach(file => {
        // Remove the function name __minifyJs that was added above.
        file.data = file.data
          .toString("utf8")
          .replace(/^\s*function\s+__minifyJs\s*\(/,
                   "function(");

        const newFile = new File({
          info: 'minified js',
          arch,
          data: Buffer.from(file.data, 'utf8'),
        });

        if (file.sourceMap) {
          newFile.setSourceMap(file.sourceMap, '/');
        }

        if (file.path) {
          newFile.setUrlFromRelPath(file.path);
          newFile.targetPath = file.path;
        } else if (dynamic) {
          const { targetPath } = source._source;
          newFile.setUrlFromRelPath(targetPath);
          newFile.targetPath = targetPath;
        } else {
          newFile.setUrlToHash('.js', '?meteor_js_resource=true');
        }

        js.push(newFile);

        if (file.stats &&
            ! dynamic &&
            minifyMode === "production") {
          // If the minifier reported any statistics, serve those data as
          // a .stats.json file alongside the newFile.
          const contents = newFile.contents();
          const statsFile = new File({
            info: "bundle size stats JSON",
            arch,
            data: Buffer.from(JSON.stringify({
              minifier: {
                name: minifierDef.isopack.name,
                version: minifierDef.isopack.version,
              },
              totalMinifiedBytes: contents.length,
              totalMinifiedGzipBytes: gzipSync(contents).length,
              minifiedBytesByPackage: file.stats,
            }, null, 2) + "\n", "utf8")
          });

          statsFile.url = newFile.url.replace(/\.js\b/, ".stats.json");
          statsFile.targetPath =
            newFile.targetPath.replace(/\.js\b/, ".stats.json");
          statsFile.cacheable = true;
          statsFile.type = "json";

          if (statsFile.url !== newFile.url &&
              statsFile.targetPath !== newFile.targetPath) {
            // If the minifier used a file extension other than .js, the
            // .replace calls above won't inject the .stats.json extension
            // into the statsFile.{url,targetPath} strings, and it would
            // be a mistake to serve the statsFile with the same URL as
            // the real JS bundle. This should be a very uncommon case.
            js.push(statsFile);
          }
        }
      });
    }

    staticFiles.forEach(file => handle(file, false));
    dynamicFiles.forEach(file => handle(file, true));

    this.js = js;
  }

  // For every source file we process, sets the domain name to
  // 'meteor://[emoji]app/', so there is a separate category in Chrome DevTools
  // with the original sources.
  rewriteSourceMaps() {
    const rewriteSourceMap = function (sm) {
      sm.sources = sm.sources.map(function (path) {
        const prefix = SOURCE_URL_PREFIX;
        if (path.slice(0, prefix.length) === prefix) {
          return path;
        }
        // This emoji makes sure the category is always last. The character
        // is PERSONAL COMPUTER (yay ES6 unicode escapes):
        // http://www.fileformat.info/info/unicode/char/1f4bb/index.htm
        return prefix + (path[0] === '/' ? '' : '/') + path;
      });
      return sm;
    }.bind(this);

    if (this.js) {
      this.js.forEach(function (js) {
        if (js.sourceMap) {
          js.sourceMap = rewriteSourceMap(js.sourceMap);
        }
      });
    }

    if (this.css) {
      this.css.forEach(function (css) {
        if (css.sourceMap) {
          css.sourceMap = rewriteSourceMap(css.sourceMap);
        }
      });
    }
  }

  // Add a Cordova plugin dependency to the target. If the same plugin
  // has already been added at a different version and `override` is
  // false, use whichever version is newest. If `override` is true, then
  // we always add the exact version specified, overriding any other
  // version that has already been added.
  _addCordovaDependency(name, version, override) {
    if (! this.cordovaDependencies) {
      return;
    }

    if (override) {
      this.cordovaDependencies[name] = version;
    } else {
      if (_.has(this.cordovaDependencies, name)) {
        var existingVersion = this.cordovaDependencies[name];

        if (existingVersion === version) { return; }

        this.cordovaDependencies[name] = packageVersionParser.
          lessThan(existingVersion, version) ? version : existingVersion;
      } else {
        this.cordovaDependencies[name] = version;
      }
    }
  }

  // Add Cordova plugins that have been directly added to the project
  // (i.e. are in .meteor/cordova-plugins).
  // XXX The versions of these direct dependencies override any versions
  // of the same plugins that packages are using.
  _addDirectCordovaDependencies() {
    if (! this.cordovaDependencies) {
      return;
    }

    _.each(this.cordovaPluginsFile.getPluginVersions(), (version, name) => {
      this._addCordovaDependency(
        name, version, true /* override any existing version */);
    });
  }

  // For each resource of the given type, make it cacheable by adding
  // a query string to the URL based on its hash.
  _addCacheBusters(type) {
    this[type].forEach((file) => {
      file.addCacheBuster();
    });
  }

  // Return the WatchSet for this target's dependency info.
  getWatchSet() {
    return this.watchSet;
  }

  // Return the most inclusive architecture with which this target is
  // compatible. For example, if we set out to build a
  // 'os.linux.x86_64' version of this target (by passing that as
  // the 'arch' argument to the constructor), but ended up not
  // including anything that was specific to Linux, the return value
  // would be 'os'.
  mostCompatibleArch() {
    return archinfo.leastSpecificDescription(
      _.pluck(this.unibuilds, 'arch').filter(
        arch => archinfo.matches(this.arch, arch)
      )
    );
  }
}

// mark methods for profiling
[
  'make',
  '_runCompilerPlugins',
  '_emitResources',
  'minifyJs',
  'rewriteSourceMaps',
].forEach((method) => {
  Target.prototype[method] = Profile(`Target#${method}`, Target.prototype[method]);
});

// Sets `obj[nmd.sourcePath] = nmd` unless the key already exists and the
// old nmd object is for a non-test package. Since nmd.sourcePath can be
// shared by test and non-test packages, this logic prefers the non-test
// nmd object when possible. Returns true iff the given nmd was added.
function addNodeModulesDirToObject(nmd, obj) {
  if (_.has(obj, nmd.sourcePath)) {
    const old = obj[nmd.sourcePath];
    // If the old NodeModulesDirectory object is not a test package, or
    // the new one is a test package, keep the old one.
    if (! old.isTestPackage ||
        nmd.isTestPackage) {
      return false;
    }
  }

  obj[nmd.sourcePath] = nmd;

  return true;
}

//////////////////// ClientTarget ////////////////////

class ClientTarget extends Target {
  constructor (options) {
    super(options);

    // CSS files. List of File. They will be loaded in the order given.
    this.css = [];

    // List of segments of additional HTML for <head>/<body>.
    this.head = [];
    this.body = [];

    if (! archinfo.matches(this.arch, 'web')) {
      throw new Error('ClientTarget targeting something that isn\'t a client?');
    }
  }

  // Minify the CSS in this target
  minifyCss(minifierDef, minifyMode) {
    this.css = this.minifyCssFiles(this.css, minifierDef, minifyMode);
  }

  minifyCssFiles(files, minifierDef, minifyMode) {
    const { arch } = this;
    const sources = files.map(file => new CssFile(file, { arch }));
    const minifier = minifierDef.userPlugin.processFilesForBundle
      .bind(minifierDef.userPlugin);

    buildmessage.enterJob('minifying app stylesheet', function () {
      try {
        const markedMinifier = buildmessage.markBoundary(minifier);
        Promise.await(markedMinifier(sources, { minifyMode }));
      } catch (e) {
        buildmessage.exception(e);
      }
    });

    return _.flatten(sources.map((source) => {
      return source._minifiedFiles.map((file) => {
        const newFile = new File({
          info: 'minified css',
          arch,
          data: Buffer.from(file.data, 'utf8')
        });
        if (file.sourceMap) {
          newFile.setSourceMap(file.sourceMap, '/');
        }

        if (file.path) {
          newFile.setUrlFromRelPath(file.path);
          newFile.targetPath = file.path;
        } else {
          newFile.setUrlToHash('.css', '?meteor_css_resource=true');
        }

        return newFile;
      });
    }));
  }

  // Output the finished target to disk
  //
  // Returns an object with the following keys:
  // - controlFile: the path (relative to 'builder') of the control file for
  // the target
  // - nodePath: an array of paths required to be set in the NODE_PATH
  // environment variable.
  write(builder, {minifyMode}) {
    builder.reserve("program.json");

    // Helper to iterate over all resources that we serve over HTTP.
    const eachResource = function (f) {
      ["js", "css", "asset"].forEach((type) => {
        this[type].forEach((file) => {
          f(file, file.type || type);
        });
      });
    }.bind(this);

    // Reserve all file names from the manifest, so that interleaved
    // generateFilename calls don't overlap with them.

    const targetPathToHash = new Map;
    eachResource((file, type) => {
      const hash = targetPathToHash.get(file.targetPath);
      if (hash) {
        // When we add assets that have a URL prefix like /__cordova, we
        // also add them without the prefix, which means there could be
        // collisions between target paths, causing builder.reserve to
        // throw an exception. However, we tolerate collisions (and call
        // builder.reserve only once) if the hashes of the two assets are
        // identical, which should always be the case when we register a
        // single asset using multiple target paths. If the hashes do not
        // match for some reason, we just call builder.reserve again and
        // let it throw.
        if (file.hash() === hash) {
          return;
        }
      } else {
        targetPathToHash.set(file.targetPath, file.hash());
      }
      builder.reserve(file.targetPath);
    });

    // Build up a manifest of all resources served via HTTP.
    const manifest = [];
    eachResource((file, type) => {
      const manifestItem = {
        path: file.targetPath,
        where: "client",
        type: type,
        cacheable: file.cacheable,
        url: file.url
      };

      const antiXSSIPrepend = Profile("anti-XSSI header for source-maps", function (sourceMap) {
        // Add anti-XSSI header to this file which will be served over
        // HTTP. Note that the Mozilla and WebKit implementations differ as to
        // what they strip: Mozilla looks for the four punctuation characters
        // but doesn't care about the newline; WebKit only looks for the first
        // three characters (not the single quote) and then strips everything up
        // to a newline.
        // https://groups.google.com/forum/#!topic/mozilla.dev.js-sourcemap/3QBr4FBng5g
        return Buffer.from(")]}'\n" + sourceMap, 'utf8');
      });

      if (file.sourceMap) {
        let mapData = null;

        // don't need to do this in devel mode
        if (minifyMode === 'production') {
          mapData = antiXSSIPrepend(JSON.stringify(file.sourceMap));
        } else {
          mapData = Buffer.from(JSON.stringify(file.sourceMap), 'utf8');
        }

        manifestItem.sourceMap = builder.writeToGeneratedFilename(
          file.targetPath + '.map', {data: mapData});

        // Use a SHA to make this cacheable.
        const sourceMapBaseName = file.hash() + '.map';
        manifestItem.sourceMapUrl = require('url').resolve(
          file.url, sourceMapBaseName);
      }

      // Set this now, in case we mutated the file's contents.
      manifestItem.size = file.size();
      manifestItem.hash = file.hash();

      if (! file.targetPath.startsWith("dynamic/")) {
        writeFile(file, builder);
        manifest.push(manifestItem);
        return;
      }

      // Another measure for preventing this file from being loaded
      // eagerly as a <script> tag, in addition to manifestItem.path being
      // prefixed with "dynamic/".
      manifestItem.type = "dynamic js";

      // Add the dynamic module to the manifest so that it can be
      // requested via HTTP from the web server. Note, however, that we
      // typically request dynamic modules via DDP, since we can compress
      // the entire response more easily that way. We expose dynamic
      // modules via HTTP here mostly to unlock future experimentation.
      manifest.push(manifestItem);

      if (manifestItem.sourceMap &&
          manifestItem.sourceMapUrl) {
        // If the file is a dynamic module, we don't embed its source map
        // in the file itself (because base64-encoded data: URLs for
        // source maps can be very large), but rather include a normal URL
        // referring to the source map (as a comment), so that it can be
        // loaded from the web server when needed.
        writeFile(file, builder, {
          sourceMapUrl: manifestItem.sourceMapUrl,
        });

        manifest.push({
          type: "json",
          path: manifestItem.sourceMap,
          url: manifestItem.sourceMapUrl,
          where: manifestItem.where,
          cacheable: manifestItem.cacheable,
          hash: manifestItem.hash,
        });

        // Now that we've written the module with a source map URL comment
        // embedded in it, and also made sure the source map is exposed by
        // the web server, we do not need to include the source map URL in
        // the manifest, because then it would also be provided via the
        // X-SourceMap HTTP header, redundantly.
        delete manifestItem.sourceMap;
        delete manifestItem.sourceMapUrl;

      } else {
        // If the dynamic module does not have a source map, just write it
        // normally.
        writeFile(file, builder);
      }
    });

    ['head', 'body'].forEach((type) => {
      const data = this[type].join('\n');
      if (data) {
        const dataBuffer = Buffer.from(data, 'utf8');
        const dataFile = builder.writeToGeneratedFilename(
          type + '.html', { data: dataBuffer });
        manifest.push({
          path: dataFile,
          where: 'internal',
          type: type,
          hash: watch.sha1(dataBuffer)
        });
      }
    });

    // Control file
    const program = {
      format: "web-program-pre1",
      manifest: manifest
    };

    if (this.arch === 'web.cordova') {
      import { CORDOVA_PLATFORM_VERSIONS } from '../cordova';
      const { WebAppHashing } = loadIsopackage('webapp-hashing');

      const cordovaCompatibilityVersions =
        _.object(_.map(CORDOVA_PLATFORM_VERSIONS, (version, platform) => {

          const pluginsExcludedFromCompatibilityHash = (process.env.METEOR_CORDOVA_COMPAT_VERSION_EXCLUDE || '')
            .split(',');

          const cordovaDependencies = Object.assign(
            Object.create(null),
            _.omit(this.cordovaDependencies, pluginsExcludedFromCompatibilityHash)
          );

          const hash = process.env[`METEOR_CORDOVA_COMPAT_VERSION_${platform.toUpperCase()}`] ||
              WebAppHashing.calculateCordovaCompatibilityHash(
                version,
                cordovaDependencies);
          return [platform, hash];
        }));
      program.cordovaCompatibilityVersions = cordovaCompatibilityVersions;
    }

    builder.writeJson('program.json', program);

    return {
      controlFile: "program.json",
      nodePath: []
    };
  }
}

// mark methods for profiling
[
  'minifyCss',
  'write'
].forEach((method) => {
  ClientTarget.prototype[method] = Profile(`ClientTarget#${method}`, ClientTarget.prototype[method]);
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

// In real life, JsImage is usually a representation for two things:
// 1. A server program of an App that contains all client programs as
// well (as they are served by the server program to the browsers).
// 2. A built Build Plugin program - a piece of software built out of
// a Build Plugin that is ran during the build process of other
// targets.
// Usually, a Build Plugin is a piece of software that is very similar
// to a server-only app: it has some code, it uses Meteor packages,
// and sometimes it is written in a language that compiles to JS.
class JsImage {
  constructor() {
    // Array of objects with keys:
    // - targetPath: relative path to use if saved to disk (or for stack traces)
    // - source: JS source code to load, as a string
    // - nodeModulesDirectories: map from absolute node_modules directory
    //   paths to NodeModulesDirectory objects indicating which
    //   directories should be searched by Npm.require()
    // - sourceMap: if set, source map for this code, as a string
    // note: this can't be called `load` at it would shadow `load()`
    this.jsToLoad = [];

    // node_modules directories that we need to copy into the target (or
    // otherwise make available at runtime). A map from an absolute path
    // on disk (NodeModulesDirectory.sourcePath) to a
    // NodeModulesDirectory object that we have created to represent it.
    //
    // The NodeModulesDirectory objects in this map are de-duplicated
    // aliases to the objects in the nodeModulesDirectory fields of
    // the objects in this.jsToLoad.
    this.nodeModulesDirectories = Object.create(null);

    // Architecture required by this image
    this.arch = null;
  }

  // Load the image into the current process. It gets its own unique
  // Package object containing its own private copy of every
  // isopack that it uses. This Package object is returned.
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
  load(bindings) {
    var self = this;
    var ret = new PackageRegistry();

    // XXX This is mostly duplicated from
    // static-assets/server/boot.js, as is Npm.require below.
    // Some way to avoid this?
    var getAsset = function (assets, assetPath, encoding, callback) {
      assetPath = files.convertToStandardPath(assetPath);
      var promise;
      if (! callback) {
        if (! Fiber.current) {
          throw new Error("The synchronous Assets API can " +
                          "only be called from within a Fiber.");
        }

        promise = new Promise(function (resolve, reject) {
          callback = function (err, res) {
            err ? reject(err) : resolve(res);
          };
        });
      }

      var _callback = function (err, result) {
        if (result && ! encoding) {
          // Sadly, this copies in Node 0.10.
          result = new Uint8Array(result);
        }
        callback(err, result);
      };

      if (!assets || !_.has(assets, assetPath)) {
        _callback(new Error("Unknown asset: " + assetPath));
      } else {
        var buffer = assets[assetPath];
        var result = encoding ? buffer.toString(encoding) : buffer;
        _callback(null, result);
      }

      if (promise) {
        return promise.await();
      }
    };

    const nodeModulesDirsByPackageName = new Map;

    _.each(self.jsToLoad, item => {
      _.each(item.nodeModulesDirectories, nmd => {
        if (nmd.local) {
          // Consider only non-local node_modules directories for build
          // plugins.
          return;
        }

        let name = nmd.packageName;
        if (name) {
          name = colonConverter.convert(name);
        }

        if (nodeModulesDirsByPackageName.has(name)) {
          nodeModulesDirsByPackageName.get(name).push(nmd.sourcePath);
        } else {
          nodeModulesDirsByPackageName.set(name, [nmd.sourcePath]);
        }
      });
    });

    const devBundleLibNodeModulesDir = files.pathJoin(
      files.getDevBundle(),
      "lib",
      "node_modules"
    );

    const appDir = files.findAppDir();
    const appNodeModules = appDir && files.pathJoin(appDir, "node_modules");

    // Eval each JavaScript file, providing a 'Npm' symbol in the same
    // way that the server environment would, a 'Package' symbol
    // so the loaded image has its own private universe of loaded
    // packages, and an 'Assets' symbol to help the package find its
    // static assets.
    var failed = false;
    _.each(self.jsToLoad, function (item) {
      if (failed) {
        return;
      }

      var env = _.extend({
        Package: ret,
        Npm: {
          require: Profile(function (name) {
            return "Npm.require(" + JSON.stringify(name) + ")";
          }, function (name, error) {
            let fullPath;

            // Replace all backslashes with forward slashes, just in case
            // someone passes a Windows-y module identifier.
            name = name.split("\\").join("/");

            let resolved;
            try {
              resolved = require.resolve(name);
            } catch (e) {
              error = error || e;
            }

            if (resolved &&
                resolved === name &&
                ! files.pathIsAbsolute(resolved)) {
              // If require.resolve(id) === id and id is not an absolute
              // identifier, it must be a built-in module like fs or http.
              return require(resolved);
            }

            function tryLookup(nodeModulesPath, name) {
              var nodeModulesTopDir = files.pathJoin(
                nodeModulesPath,
                name.split("/", 1)[0]
              );

              if (files.exists(nodeModulesTopDir)) {
                return fullPath = files.convertToOSPath(
                  files.pathJoin(nodeModulesPath, name)
                );
              }
            }

            const found = _.some(item.nodeModulesDirectories, nmd => {
              // Npm.require doesn't consider local node_modules
              // directories.
              return ! nmd.local && tryLookup(nmd.sourcePath, name);
            });

            if (found || tryLookup(devBundleLibNodeModulesDir, name)) {
              return require(fullPath);
            }

            if (appNodeModules &&
                tryLookup(appNodeModules, name)) {
              return require(fullPath);
            }

            if (appDir && resolved) {
              const isOutsideAppDir =
                files.pathRelative(appDir, resolved).startsWith("..");

              if (! isOutsideAppDir) {
                return require(resolved);
              }
            }

            throw error || new Error(
              "Cannot find module " + JSON.stringify(name)
            );
          })
        },

        /**
         * @summary The namespace for Assets functions, lives in the bundler.
         * @namespace
         * @name Assets
         */
        Assets: {

          /**
           * @summary Retrieve the contents of the static server asset as a UTF8-encoded string.
           * @locus Server
           * @memberOf Assets
           * @param {String} assetPath The path of the asset, relative to the application's `private` subdirectory.
           * @param {Function} [asyncCallback] Optional callback, which is called asynchronously with the error or result after the function is complete. If not provided, the function runs synchronously.
           */
          getText: function (assetPath, callback) {
            return getAsset(item.assets, assetPath, "utf8", callback);
          },

          /**
           * @summary Retrieve the contents of the static server asset as an [EJSON Binary](#ejson_new_binary).
           * @locus Server
           * @memberOf Assets
           * @param {String} assetPath The path of the asset, relative to the application's `private` subdirectory.
           * @param {Function} [asyncCallback] Optional callback, which is called asynchronously with the error or result after the function is complete. If not provided, the function runs synchronously.
           */
          getBinary: function (assetPath, callback) {
            return getAsset(item.assets, assetPath, undefined, callback);
          }
        }
      }, bindings || {});

      if (item.targetPath === "packages/modules-runtime.js") {
        env.npmRequire = self._makeNpmRequire(nodeModulesDirsByPackageName);
        env.Profile = Profile;
      }

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
  }

  // Create an npmRequire function suitable for use in the
  // packages/modules-runtime/modules-runtime.js implementation of
  // Module.prototype.useNode. This function accepts module identifiers of
  // the form /node_modules/meteor/*/node_modules/... and loads the
  // corresponding packages using Node's native require function.
  _makeNpmRequire(nodeModulesDirsByPackageName) {
    function npmRequire(id) {
      return require(npmResolve(id));
    }

    const resolveCache = Object.create(null);

    function npmResolve(id) {
      if (id in resolveCache) {
        return resolveCache[id];
      }

      const parts = id.split("/");
      let start = 0;
      let dirs;

      if (parts[start] === "") ++start;
      if (parts[start] === "node_modules" &&
          parts[start + 1] === "meteor" &&
          parts[start + 3] === "node_modules") {
        const packageName = colonConverter.convert(parts[start + 2]);
        dirs = nodeModulesDirsByPackageName.get(packageName);
        start += 4;

      } else {
        dirs = [];

        const appDirs = nodeModulesDirsByPackageName.get(null);
        if (appDirs) {
          dirs.push(...appDirs);
        }

        // We usually move all node_modules from the app into the source
        // batch for the "modules" package, so we need to consider those
        // directories in addition to appDirs.
        const modulesDirs = nodeModulesDirsByPackageName.get("modules");
        if (modulesDirs) {
          dirs.push(...modulesDirs);
        }

        start += 1;
      }

      if (dirs && dirs.length > 0) {
        const relativePath = parts.slice(start).join("/");
        let fullPath;

        _.some(dirs, dir => {
          const osPath = files.convertToOSPath(
            files.pathJoin(dir, relativePath));

          if (files.exists(osPath)) {
            return fullPath = osPath;
          }
        });

        if (fullPath) {
          return resolveCache[id] = fullPath;
        }
      }

      throw new Error("Cannot find module '" + id + "'");
    }

    npmRequire.resolve = npmResolve;

    return npmRequire;
  }

  // Write this image out to disk
  //
  // Returns an object with the following keys:
  // - controlFile: the path (relative to 'builder') of the control file for
  // the image
  // - nodePath: an array of paths required to be set in the NODE_PATH
  // environment variable.
  write(builder, {
    buildMode,
    // falsy or 'symlink', documented on exports.bundle
    includeNodeModules,
  } = {}) {
    var self = this;

    builder.reserve("program.json");

    // Finalize choice of paths for node_modules directories -- These
    // paths are no longer just "preferred"; they are the final paths
    // that we will use
    var nodeModulesDirectories = Object.create(null);
    _.each(self.nodeModulesDirectories || [], function (nmd) {
      // We need to find the actual file system location for the node modules
      // this JS Image uses, so that we can add it to nodeModulesDirectories
      var modulesPhysicalLocation;
      if (! includeNodeModules ||
          includeNodeModules === 'symlink') {
        modulesPhysicalLocation = nmd.getPreferredBundlePath("bundle");
      } else {
        // This is some option we didn't expect - someone has added another case
        // to the includeNodeModules option but didn't update this if block.
        // Fail hard.
        throw new Error("Option includeNodeModules wasn't falsy or 'symlink'. " +
                        "It was: " + includeNodeModules);
      }

      nmd = nmd.copy();
      nmd.preferredBundlePath = modulesPhysicalLocation;
      addNodeModulesDirToObject(nmd, nodeModulesDirectories);
    });

    // If multiple load files share the same asset, only write one copy of
    // each. (eg, for app assets).
    var assetFilesBySha = {};

    // JavaScript sources
    var load = [];
    _.each(self.jsToLoad, function (item) {
      if (! item.targetPath) {
        throw new Error("No targetPath?");
      }

      var loadItem = {
        node_modules: {}
      };

      _.each(item.nodeModulesDirectories, nmd => {
        // We need to make sure to use the directory name we got from
        // builder.generateFilename here.
        // XXX these two parallel data structures of self.jsToLoad and
        //     self.nodeModulesDirectories are confusing
        const generatedNMD = nodeModulesDirectories[nmd.sourcePath];
        if (generatedNMD) {
          assert.strictEqual(
            typeof generatedNMD.preferredBundlePath,
            "string"
          );

          loadItem.node_modules[generatedNMD.preferredBundlePath] =
            generatedNMD.toJSON();
        }
      });

      const preferredPaths = Object.keys(loadItem.node_modules);
      if (preferredPaths.length === 1) {
        // For backwards compatibility, if there's only one node_modules
        // directory, store it as a single string.
        loadItem.node_modules = preferredPaths[0];
      } else if (preferredPaths.length === 0) {
        // If there are no node_modules directories, don't confuse older
        // versions of Meteor by storing an empty object.
        delete loadItem.node_modules;
      }

      // Will be initialized with a Buffer version of item.source, with
      // //# sourceMappingURL comments appropriately removed/appended.
      let sourceBuffer;

      if (item.sourceMap) {
        const sourceMapBuffer =
          Buffer.from(JSON.stringify(item.sourceMap), "utf8");

        loadItem.sourceMap = builder.writeToGeneratedFilename(
          item.targetPath + ".map",
          { data: sourceMapBuffer }
        );

        const sourceMappingURL =
          "data:application/json;charset=utf8;base64," +
          sourceMapBuffer.toString("base64");

        // Remove any existing sourceMappingURL line. (eg, if roundtripping
        // through JsImage.readFromDisk, don't end up with two!)
        sourceBuffer = addSourceMappingURL(
          item.source,
          sourceMappingURL,
          item.targetPath,
        );

        if (item.sourceMapRoot) {
          loadItem.sourceMapRoot = item.sourceMapRoot;
        }
      } else {
        // If we do not have an item.sourceMap, then we still want to
        // remove any existing //# sourceMappingURL comments.
        // https://github.com/meteor/meteor/issues/9894
        sourceBuffer = removeSourceMappingURLs(item.source);
      }

      loadItem.path = builder.writeToGeneratedFilename(
        item.targetPath,
        { data: sourceBuffer }
      );

      if (!_.isEmpty(item.assets)) {
        // For package code, static assets go inside a directory inside
        // assets/packages specific to this package. Application assets (e.g. those
        // inside private/) go in assets/app/.
        // XXX same hack as setTargetPathFromRelPath
          var assetBundlePath;
        if (item.targetPath.match(/^packages\//)) {
          var dir = files.pathDirname(item.targetPath);
          var base = files.pathBasename(item.targetPath, ".js");
          assetBundlePath = files.pathJoin('assets', dir, base);
        } else {
          assetBundlePath = files.pathJoin('assets', 'app');
        }

        loadItem.assets = {};
        _.each(item.assets, function (data, relPath) {
          var sha = watch.sha1(data);
          if (_.has(assetFilesBySha, sha)) {
            loadItem.assets[relPath] = assetFilesBySha[sha];
          } else {
            loadItem.assets[relPath] = assetFilesBySha[sha] =
              builder.writeToGeneratedFilename(
                files.pathJoin(assetBundlePath, relPath), { data: data });
          }
        });
      }

      if (! item.targetPath.startsWith("dynamic/")) {
        load.push(loadItem);
      }
    });

    const rebuildDirs = Object.create(null);

    // node_modules resources from the packages. Due to appropriate
    // builder configuration, 'meteor bundle' and 'meteor deploy' copy
    // them, and 'meteor run' symlinks them. If these contain
    // arch-specific code then the target will end up having an
    // appropriately specific arch.
    _.each(nodeModulesDirectories, function (nmd) {
      assert.strictEqual(typeof nmd.preferredBundlePath, "string");

      if (! nmd.isPortable()) {
        const parentDir = files.pathDirname(nmd.preferredBundlePath);
        rebuildDirs[parentDir] = parentDir;
      }

      if (nmd.sourcePath !== nmd.preferredBundlePath) {
        var copyOptions = {
          from: nmd.sourcePath,
          to: nmd.preferredBundlePath,
          npmDiscards: nmd.npmDiscards,
          symlink: includeNodeModules === 'symlink'
        };

        const prodPackagePredicate =
          // This condition essentially means we don't strip devDependencies
          // when running tests, which is important for use cases like the one
          // described in #7953. Note that devDependencies can still be used
          // when buildMode === "development" because the app has access to
          // the original node_modules.
          (buildMode === "production" ||
           buildMode === "development") &&
          nmd.local && // Only filter local node_modules directories.
          nmd.getProdPackagePredicate();

        if (prodPackagePredicate) {
          // When copying a local node_modules directory, ignore any npm
          // package directories not in the list of production package
          // names, as determined by meteorNpm.getProdPackageNames. Note
          // that we always copy a package directory if any package of the
          // same name is listed as a production dependency anywhere in
          // nmd.sourcePath. In other words, if you list a package in your
          // "devDependencies", but it also gets listed in some other
          // package's "dependencies", then every copy of that package
          // will be copied to the destination directory. A little bit of
          // overcopying vastly simplifies the job of the filter.
          copyOptions.filter = prodPackagePredicate;
        }

        builder.copyNodeModulesDirectory(copyOptions);
      }
    });

    // This JSON file will be read by npm-rebuild.js, which is executed to
    // trigger rebuilds for all non-portable npm packages.
    builder.write("npm-rebuilds.json", {
      data: Buffer.from(
        JSON.stringify(Object.keys(rebuildDirs), null, 2) + "\n",
        "utf8"
      )
    });

    // Control file
    builder.writeJson('program.json', {
      format: "javascript-image-pre1",
      arch: self.arch,
      load: load
    });

    return {
      controlFile: "program.json",
      nodePath: []
    };
  }

  // Create a JsImage by loading a bundle of format
  // 'javascript-image-pre1' from disk (eg, previously written out with
  // write()). `dir` is the path to the control file.
  static readFromDisk (controlFilePath) {
    var ret = new JsImage;
    var json = JSON.parse(files.readFile(controlFilePath));
    var dir = files.pathDirname(controlFilePath);

    if (json.format !== "javascript-image-pre1") {
      throw new Error("Unsupported plugin format: " +
                      JSON.stringify(json.format));
    }

    ret.arch = json.arch;

    // Rebuild binary npm packages if host arch matches image arch.
    const rebuildBinaries = archinfo.matches(archinfo.host(), ret.arch);

    _.each(json.load, function (item) {
      rejectBadPath(item.path);

      let nodeModulesDirectories;
      if (item.node_modules) {
        _.extend(
          ret.nodeModulesDirectories,
          nodeModulesDirectories =
            NodeModulesDirectory.readDirsFromJSON(item.node_modules, {
              sourceRoot: dir,
              rebuildBinaries,
            })
        );
      }

      var loadItem = {
        targetPath: item.path,
        source: files.readFile(files.pathJoin(dir, item.path), 'utf8'),
        nodeModulesDirectories,
      };

      if (item.sourceMap) {
        // XXX this is the same code as isopack.initFromPath
        rejectBadPath(item.sourceMap);
        loadItem.sourceMap = JSON.parse(files.readFile(
          files.pathJoin(dir, item.sourceMap), 'utf8'));
        loadItem.sourceMapRoot = item.sourceMapRoot;
      }

      if (!_.isEmpty(item.assets)) {
        loadItem.assets = {};
        _.each(item.assets, function (filename, relPath) {
          loadItem.assets[relPath] = files.readFile(files.pathJoin(dir, filename));
        });
      }

      ret.jsToLoad.push(loadItem);
    });

    return ret;
  }
}

// mark methods for profiling
[
  'load',
  'write'
].forEach((method) => {
  JsImage.prototype[method] = Profile(`JsImage#${method}`, JsImage.prototype[method]);
});

class JsImageTarget extends Target {
  constructor(options) {
    super(options);

    if (! archinfo.matches(this.arch, "os")) {
      // Conceivably we could support targeting the client as long as
      // no native node modules were used.  No use case for that though.
      throw new Error("JsImageTarget targeting something unusual?");
    }
  }

  toJsImage() {
    var self = this;
    var ret = new JsImage;

    _.each(self.js, function (file) {
      ret.jsToLoad.push({
        targetPath: file.targetPath,
        source: file.contents().toString('utf8'),
        nodeModulesDirectories: file.nodeModulesDirectories,
        assets: file.assets,
        sourceMap: file.sourceMap,
        sourceMapRoot: file.sourceMapRoot
      });
    });

    ret.nodeModulesDirectories = self.nodeModulesDirectories;
    ret.arch = self.mostCompatibleArch();

    return ret;
  }
}


//////////////////// ServerTarget ////////////////////

class ServerTarget extends JsImageTarget {
  // options specific to this subclass:
  // - clientTarget: the ClientTarget to serve up over HTTP as our client
  // - releaseName: the Meteor release name (for retrieval at runtime)
  // - appIdentifier: the app identifier (for retrieval at runtime)
  constructor (options, ...args) {
    super(options, ...args);

    this.clientTargets = options.clientTargets;
    this.releaseName = options.releaseName;
    this.appIdentifier = options.appIdentifier;

    if (! archinfo.matches(this.arch, "os")) {
      throw new Error("ServerTarget targeting something that isn't a server?");
    }
  }

  // Output the finished target to disk
  //
  // Returns the path (relative to 'builder') of the control file for
  // the plugin and the required NODE_PATH.
  write(builder, {
    buildMode,
    // falsy or 'symlink', documented in exports.bundle
    includeNodeModules,
    // a function that takes {forTarget: Target, relativeTo: Target} and
    // return the path of one target in the bundle relative to another. hack
    // to get the path of the client target.. we'll find a better solution
    // here eventually
    getRelativeTargetPath,
  }) {
    var self = this;
    var nodePath = [];

    // This is where the dev_bundle will be downloaded and unpacked
    builder.reserve('dependencies');

    // Mapping from arch to relative path to the client program, if we have any
    // (hack). Ex.: { 'web.browser': '../web.browser/program.json', ... }
    var clientTargetPaths = {};
    if (self.clientTargets) {
      _.each(self.clientTargets, function (target) {
        clientTargetPaths[target.arch] = files.pathJoin(getRelativeTargetPath({
          forTarget: target,
          relativeTo: self,
        }), 'program.json');
      });
    }

    // We will write out config.json, the dependency kit, and the
    // server driver alongside the JsImage
    builder.writeJson("config.json", {
      meteorRelease: self.releaseName || undefined,
      appId: self.appIdentifier || undefined,
      clientPaths: clientTargetPaths
    });

    // Write package.json and npm-shrinkwrap.json for the dependencies of
    // boot.js.
    const serverPkgJson = JSON.parse(files.readFile(
      files.pathJoin(files.getDevBundle(), 'etc', 'package.json')
    ));

    serverPkgJson.scripts = serverPkgJson.scripts || {};
    serverPkgJson.scripts.install = "node npm-rebuild.js";

    serverPkgJson.dependencies["node-gyp"] =
      require("node-gyp/package.json").version;

    serverPkgJson.dependencies["node-pre-gyp"] =
      require("node-pre-gyp/package.json").version;

    builder.write('package.json', {
      data: Buffer.from(
        JSON.stringify(serverPkgJson, null, 2) + "\n",
        "utf8"
      )
    });

    builder.write('npm-shrinkwrap.json', {
      file: files.pathJoin(files.getDevBundle(), 'etc', 'npm-shrinkwrap.json')
    });

    // This is a hack to make 'meteor run' faster (so you don't have to run 'npm
    // install' using the above package.json and npm-shrinkwrap.json on every
    // rebuild).
    if (includeNodeModules === 'symlink') {
      builder.write('node_modules', {
        symlink: files.pathJoin(files.getDevBundle(), 'server-lib', 'node_modules')
      });
    } else if (includeNodeModules) {
      // This is some option we didn't expect - someone has added another case
      // to the includeNodeModules option but didn't update this if block. Fail
      // hard.
      throw new Error("Option includeNodeModules wasn't falsy or 'symlink'");
    }

    // Linked JavaScript image (including static assets, assuming that there are
    // any JS files at all)
    var jsImage = self.toJsImage();
    jsImage.write(builder, {
      buildMode,
      includeNodeModules,
    });

    const toolsDir = files.pathDirname(
      files.convertToStandardPath(__dirname));

    builder.write("profile.js", {
      file: files.pathJoin(toolsDir, "tool-env", "profile.js"),
    });

    // Server bootstrap
    _.each([
      "boot.js",
      "boot-utils.js",
      "debug.js",
      "server-json.js",
      "mini-files.js",
      "npm-require.js",
      "npm-rebuild.js",
      "npm-rebuild-args.js",
    ], function (filename) {
      builder.write(filename, {
        file: files.pathJoin(
          toolsDir,
          'static-assets',
          'server',
          filename
        )
      });
    });

    // Script that fetches the dev_bundle and runs the server bootstrap
    // XXX this is #GalaxyLegacy, the generated start.sh is not really used by
    // anything anymore
    if (archinfo.VALID_ARCHITECTURES[self.arch] !== true) {
      throw new Error(
        `MDG does not publish dev_bundles for arch: ${self.arch}`
      );
    }

    // Nothing actually pays attention to the `path` field for a server program
    // in star.json any more, so it might as well be boot.js. (It used to be
    // start.sh, a script included for the legacy Galaxy prototype.)
    var controlFilePath = 'boot.js';
    return {
      controlFile: controlFilePath,
      nodePath: nodePath
    };
  }
}

// mark methods for profiling
[
  'write'
].forEach((method) => {
  ServerTarget.prototype[method] = Profile(`ServerTarget#${method}`, ServerTarget.prototype[method]);
});

var writeFile = Profile("bundler writeFile", function (file, builder, options) {
  if (! file.targetPath) {
    throw new Error("No targetPath?");
  }

  // XXX should probably use sanitize: true, but that will have
  // to wait until the server is actually driven by the manifest
  // (rather than just serving all of the files in a certain
  // directories)

  let data = file.contents();
  const hash = file.hash();

  if (options && options.sourceMapUrl) {
    data = addSourceMappingURL(data, options.sourceMapUrl);
  } else {
    // If we do not have an options.sourceMapUrl to append, then we still
    // want to remove any existing //# sourceMappingURL comments.
    // https://github.com/meteor/meteor/issues/9894
    data = removeSourceMappingURLs(data);
  }

  builder.write(file.targetPath, { data, hash });
});

// Takes a Buffer or string and returns a Buffer. If it looks like there
// are no //# sourceMappingURL comments to remove, an attempt is made to
// return the provided buffer without modification.
function removeSourceMappingURLs(data) {
  if (Buffer.isBuffer(data)) {
    // Unfortuantely there is no way to search a Buffer using a RegExp, so
    // there's a chance of false positives here, which could lead to
    // unnecessarily stringifying and re-Buffer.from-ing the data, though
    // that should not cause any logical problems.
    if (! data.includes("//# source", 0, "utf8")) {
      return data;
    }
    data = data.toString("utf8");
  }

  // Remove any/all existing //# sourceMappingURL comments using
  // String#replace (since unfortunately there is no Buffer#replace).
  data = data.replace(/\n\/\/# source(?:Mapping)?URL=[^\n]+/g, "\n");

  // Always return a Buffer.
  return Buffer.from(data, "utf8");
}

const newLineBuffer = Buffer.from("\n", "utf8");

// The data argument may be either a Buffer or a string, but this function
// always returns a Buffer.
function addSourceMappingURL(data, url, targetPath) {
  // An array of Buffer objects, even when data is a string.
  const parts = [removeSourceMappingURLs(data)];

  if (targetPath) {
    // If a targetPath was provided, use it to add a sourceURL comment to
    // help associate output files with mapped source files.
    parts.push(
      newLineBuffer,
      Buffer.from(
        `//# sourceURL=${SOURCE_URL_PREFIX}/${targetPath}`,
        "utf8"
      )
    );
  }

  parts.push(
    newLineBuffer,
    Buffer.from("//# sourceMappingURL=" + url, "utf8"),
    newLineBuffer // trailing newline
  );

  // Always return a Buffer.
  return Buffer.concat(parts);
}

// Writes a target a path in 'programs'
var writeTargetToPath = Profile(
  "bundler writeTargetToPath",
  function (name, target, outputPath, {
    includeNodeModules,
    getRelativeTargetPath,
    previousBuilder,
    buildMode,
    minifyMode,
  }) {
    var builder = new Builder({
      outputPath: files.pathJoin(outputPath, 'programs', name),
      previousBuilder
    });

    var targetBuild = target.write(builder, {
      includeNodeModules,
      getRelativeTargetPath,
      buildMode,
      minifyMode,
    });

    builder.complete();

    return {
      name,
      arch: target.mostCompatibleArch(),
      path: files.pathJoin('programs', name, targetBuild.controlFile),
      nodePath: targetBuild.nodePath,
      cordovaDependencies: target.cordovaDependencies || undefined,
      builder
    };
  });

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
//     clientWatchSet: watch.WatchSet for all files and directories that
//                     ultimately went into all client programs
//     serverWatchSet: watch.WatchSet for all files and directories that
//                     ultimately went into all server programs
//     starManifest: the JSON manifest of the star
//     nodePath: an array of paths required to be set in NODE_PATH. It's
//               up to the called to determine what they should be.
// }
//
// options:
// - includeNodeModules: string or falsy, documented on exports.bundle
// - builtBy: vanity identification string to write into metadata
// - releaseName: The Meteor release version
// - getRelativeTargetPath: see doc at ServerTarget.write
// - previousBuilder: previous Builder object used in previous iteration
var writeSiteArchive = Profile("bundler writeSiteArchive", function (
  targets, outputPath, {
    includeNodeModules,
    builtBy,
    releaseName,
    getRelativeTargetPath,
    previousBuilders,
    buildMode,
    minifyMode
  }) {

  const builders = {};
  const previousStarBuilder = previousBuilders && previousBuilders.star;
  const builder = new Builder({outputPath,
                               previousBuilder: previousStarBuilder});
  builders.star = builder;

  try {
    var json = {
      format: "site-archive-pre1",
      builtBy,
      programs: [],
      meteorRelease: releaseName,
      nodeVersion: process.versions.node,
      npmVersion: meteorNpm.npmVersion,
    };
    var nodePath = [];

    // Tell the deploy server what version of the dependency kit we're using, so
    // it can load the right modules. (Include this even if we copied or
    // symlinked a node_modules, since that's probably enough for it to work in
    // spite of the presence of node_modules for the wrong arch). The place we
    // stash this is grody for temporary reasons of backwards compatibility.
    builder.write(files.pathJoin('server', '.bundle_version.txt'), {
      file: files.pathJoin(files.getDevBundle(), '.bundle_version.txt')
    });

    builder.write('.node_version.txt', {
      data: Buffer.from(process.version + '\n', 'utf8')
    });

    // Affordances for standalone use
    if (targets.server) {
      // add program.json as the first argument after "node main.js" to the boot script.
      builder.write('main.js', {
        data: Buffer.from(exports._mainJsContents, 'utf8')
      });

      builder.write('README', { data: Buffer.from(
`This is a Meteor application bundle. It has only one external dependency:
Node.js ${process.version}. To run the application:

  $ (cd programs/server && npm install)
  $ export MONGO_URL='mongodb://user:password@host:port/databasename'
  $ export ROOT_URL='http://example.com'
  $ export MAIL_URL='smtp://user:password@mailhost:port/'
  $ node main.js

Use the PORT environment variable to set the port where the
application will listen. The default is 80, but that will require
root on most systems.

Find out more about Meteor at meteor.com.
`,
      'utf8')});
    }

    // Merge the WatchSet of everything that went into the bundle.
    const clientWatchSet = new watch.WatchSet();
    const serverWatchSet = new watch.WatchSet();
    const dependencySources = [builder].concat(_.values(targets));
    dependencySources.forEach(s => {
      if (s instanceof ClientTarget) {
        clientWatchSet.merge(s.getWatchSet());
      } else {
        serverWatchSet.merge(s.getWatchSet());
      }
    });

    Object.keys(targets).forEach(name => {
      const target = targets[name];
      const previousBuilder =
              (previousBuilders && previousBuilders[name]) ?
              previousBuilders[name] : null;
      const {
        arch, path, cordovaDependencies,
        nodePath: targetNP,
        builder: targetBuilder
      } =
        writeTargetToPath(name, target, builder.buildPath, {
          includeNodeModules,
          builtBy,
          releaseName,
          getRelativeTargetPath,
          previousBuilder,
          buildMode,
          minifyMode
        });

      builders[name] = targetBuilder;

      json.programs.push({
        name, arch, path, cordovaDependencies
      });

      nodePath = nodePath.concat(targetNP);
    });

    // Control file
    builder.writeJson('star.json', json);

    // We did it!
    builder.complete();

    // Now, go and "fix up" the outputPath properties of the sub-builders.
    // Since the sub-builders originally were targetted at a temporary
    // buildPath of the main builder, their outputPath properties need to
    // be adjusted so we can later pass them as previousBuilder's
    Object.keys(builders).forEach(name => {
      const subBuilder = builders[name];
      subBuilder.outputPath = builder.outputPath + subBuilder.outputPath.substring(builder.buildPath.length);
    });

    return {
      clientWatchSet,
      serverWatchSet,
      starManifest: json,
      nodePath,
      builders
    };
  } catch (e) {
    builder.abort();
    throw e;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Main
///////////////////////////////////////////////////////////////////////////////

/**
 * Builds a Meteor app.
 *
 * options are:
 *
 * - projectContext: Required. The project to build (ProjectContext object).
 *
 * - outputPath: Required. Path to the directory where the output (an
 *   untarred bundle) should go. This directory will be created if it
 *   doesn't exist, and removed first if it does exist.
 *   Nothing is written to disk if this option is null.
 *
 * - includeNodeModules: specifies how node_modules for program should be
 *   included:
 *   + false/null/undefined - don't include node_modules
 *   + 'symlink' - we create a symlink from programs/server/node_modules to the
 *   dev bundle's server-lib/node_modules.  This is a hack to make 'meteor run'
 *   faster. (It is preferred on systems with symlinks as we can't just set
 *   $NODE_PATH because then random node_modules directories above cwd take
 *   precedence.) To make it even hackier, this also means we make node_modules
 *   directories for packages symlinks instead of copies.
 *
 * - buildOptions: may include
 *   - minifyMode: string, type of minification for the CSS and JS assets
 *     ('development'/'production', defaults to 'development')
 *   - serverArch: the server architecture to target (string, default
 *     archinfo.host())
 *   - buildMode: string, 'development'/'production'/'test', governs inclusion
 *     of debugOnly, prodOnly and testOnly packages, default 'production'
 *   - webArchs: array of 'web.*' options to build (defaults to
 *     projectContext.platformList.getWebArchs())
 *   - warnings: a MessageSet of linting messages or null if linting
 *     wasn't performed at all (either disabled or lack of linters).
 *
 * - hasCachedBundle: true if we already have a cached bundle stored in
 *   /build. When true, we only build the new client targets in the bundle.
 *
 * Returns an object with keys:
 * - errors: A buildmessage.MessageSet, or falsy if bundling succeeded.
 * - serverWatchSet: Information about server files and paths that were
 *   inputs into the bundle and that we may wish to monitor for
 *   changes when developing interactively, as a watch.WatchSet.
 * - clientWatchSet: Like 'serverWatchSet', but for client files
 * - starManifest: The manifest of the outputted star
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
  return files.withCache(() => bundle(options));
};

function bundle({
  projectContext,
  outputPath,
  includeNodeModules,
  buildOptions,
  previousBuilders,
  hasCachedBundle,
}) {
  buildOptions = buildOptions || {};

  var serverArch = buildOptions.serverArch || archinfo.host();
  var webArchs;
  if (buildOptions.webArchs) {
    // Don't attempt to build web.cordova when platforms have been removed
    webArchs = _.intersection(
      buildOptions.webArchs,
      projectContext.platformList.getWebArchs());
  } else {
    webArchs = projectContext.platformList.getWebArchs();
  }
  const minifyMode = buildOptions.minifyMode || 'development';
  const buildMode = buildOptions.buildMode || 'production';

  var releaseName =
    release.current.isCheckout() ? "none" : release.current.name;
  var builtBy = "Meteor" + (release.current.name ?
                            " " + release.current.name : "");

  var appIdentifier = projectContext.appIdentifier;

  var success = false;
  var serverWatchSet = new watch.WatchSet();
  var clientWatchSet = new watch.WatchSet();
  var starResult = null;
  var targets = {};
  var nodePath = [];
  var lintingMessages = null;
  var builders = {};

  const bundlerCacheDir =
      projectContext.getProjectLocalDirectory('bundler-cache');

  if (! release.usingRightReleaseForApp(projectContext)) {
    throw new Error("running wrong release for app?");
  }

  if (! _.contains(['development', 'production', 'test'], buildMode)) {
    throw new Error('Unrecognized build mode: ' + buildMode);
  }

  var messages = buildmessage.capture({
    title: "building the application"
  }, function () {
    var packageSource = new PackageSource;
    packageSource.initFromAppDir(projectContext, exports.ignoreFiles);

    var makeClientTarget = Profile(
      "bundler.bundle..makeClientTarget", function (app, webArch, options) {
      var client = new ClientTarget({
        bundlerCacheDir,
        packageMap: projectContext.packageMap,
        isopackCache: projectContext.isopackCache,
        sourceRoot: packageSource.sourceRoot,
        arch: webArch,
        cordovaPluginsFile: (webArch === 'web.cordova'
                             ? projectContext.cordovaPluginsFile : null),
        buildMode: buildOptions.buildMode
      });

      client.make({
        packages: [app],
        minifyMode: minifyMode,
        minifiers: options.minifiers || [],
        addCacheBusters: true
      });

      return client;
    });

    var makeServerTarget = Profile(
      "bundler.bundle..makeServerTarget", function (app, clientTargets) {
      var targetOptions = {
        bundlerCacheDir,
        packageMap: projectContext.packageMap,
        isopackCache: projectContext.isopackCache,
        sourceRoot: packageSource.sourceRoot,
        arch: serverArch,
        releaseName: releaseName,
        appIdentifier: appIdentifier,
        buildMode: buildOptions.buildMode,
      };
      if (clientTargets) {
        targetOptions.clientTargets = clientTargets;
      }

      var server = new ServerTarget(targetOptions);

      server.make({
        packages: [app]
      });

      return server;
    });

    // Create a Isopack object that represents the app
    // XXX should this be part of prepareProjectForBuild and get cached?
    //     at the very least, would speed up deploy after build.
    var app = compiler.compile(packageSource, {
      packageMap: projectContext.packageMap,
      isopackCache: projectContext.isopackCache,
      includeCordovaUnibuild: projectContext.platformList.usesCordova()
    });

    const mergeAppWatchSets = () => {
      var projectAndLocalPackagesWatchSet =
        projectContext.getProjectAndLocalPackagesWatchSet();

      clientWatchSet.merge(projectAndLocalPackagesWatchSet);
      clientWatchSet.merge(app.getClientWatchSet());

      serverWatchSet.merge(projectAndLocalPackagesWatchSet);
      serverWatchSet.merge(app.getServerWatchSet());
    };

    // If we failed to 'compile' the app (which mostly means something odd
    // happened like clashing extension handlers, or a legacy source handler
    // failed), restart on any relevant change, and be done.
    if (buildmessage.jobHasMessages()) {
      return mergeAppWatchSets();
    }

    if (! buildmessage.jobHasMessages()) {
      lintingMessages = lintBundle(projectContext, app, packageSource);
    }
    // If while trying to lint, we got a compilation error (eg, an issue loading
    // plugins in one of the linter packages), restart on any relevant change,
    // and be done.
    if (buildmessage.jobHasMessages()) {
      return mergeAppWatchSets();
    }

    var minifiers = null;
    if (! _.contains(['development', 'production'], minifyMode)) {
      throw new Error('Unrecognized minification mode: ' + minifyMode);
    }
    minifiers = compiler.getMinifiers(packageSource, {
      isopackCache: projectContext.isopackCache,
      isopack: app
    });
    // If figuring out what the minifiers are failed (eg, clashing extension
    // handlers), restart on any relevant change, and be done.
    if (buildmessage.jobHasMessages()) {
      return mergeAppWatchSets();
    }

    var clientTargets = [];
    // Client
    _.each(webArchs, function (arch) {
      var client = makeClientTarget(app, arch, {minifiers});
      clientTargets.push(client);
      targets[arch] = client;
    });

    // Server
    if (! hasCachedBundle) {
      var server = makeServerTarget(app, clientTargets);
      targets.server = server;
    }

    // Hack to let servers find relative paths to clients. Should find
    // another solution eventually (probably some kind of mount
    // directive that mounts the client bundle in the server at runtime)
    var getRelativeTargetPath = function (options) {
      var pathForTarget = function (target) {
        var name;
        _.each(targets, function (t, n) {
          if (t === target) {
            name = n;
          }
        });
        if (! name) {
          throw new Error("missing target?");
        }
        return files.pathJoin('programs', name);
      };

      return files.pathRelative(pathForTarget(options.relativeTo),
                                pathForTarget(options.forTarget));
    };

    // Write to disk
    var writeOptions = {
      includeNodeModules,
      builtBy,
      releaseName,
      getRelativeTargetPath,
      minifyMode: minifyMode
    };

    if (outputPath !== null) {
      if (hasCachedBundle) {
        // If we already have a cached bundle, just recreate the new targets.
        // XXX This might make the contents of "star.json" out of date.
        builders = _.clone(previousBuilders);
        _.each(targets, function (target, name) {
          const previousBuilder = previousBuilders && previousBuilders[name];
          var targetBuild = writeTargetToPath(
            name, target, outputPath,
            _.extend({
              buildMode: buildOptions.buildMode,
            }, writeOptions, {previousBuilder})
         );
          nodePath = nodePath.concat(targetBuild.nodePath);
          clientWatchSet.merge(target.getWatchSet());
          builders[name] = targetBuild.builder;
        });
      } else {
        starResult = writeSiteArchive(
          targets,
          outputPath,
          _.extend({
            buildMode: buildOptions.buildMode,
          }, writeOptions, {previousBuilders})
        );

        nodePath = nodePath.concat(starResult.nodePath);
        serverWatchSet.merge(starResult.serverWatchSet);
        clientWatchSet.merge(starResult.clientWatchSet);
        builders = starResult.builders;
      }
    }

    success = true;
  });

  if (success && messages.hasMessages()) {
    // there were errors
    success = false;
  }

  return {
    errors: success ? false : messages,
    warnings: lintingMessages,
    serverWatchSet,
    clientWatchSet,
    starManifest: starResult && starResult.starManifest,
    nodePath,
    builders
  };
}

// Returns null if there are no lint warnings and the app has no linters
// defined. Returns an empty MessageSet if the app has a linter defined but
// there are no lint warnings (on app or packages).
function lintBundle (projectContext, isopack, packageSource) {
  buildmessage.assertInJob();

  let lintedAnything = false;
  const lintingMessages = new buildmessage._MessageSet();

  if (projectContext.lintAppAndLocalPackages) {
    const {warnings: appMessages, linted} = compiler.lint(packageSource, {
      isopack,
      isopackCache: projectContext.isopackCache
    });
    if (linted) {
      lintedAnything = true;
      lintingMessages.merge(appMessages);
    }
  }

  const localPackagesMessages =
    projectContext.getLintingMessagesForLocalPackages();
  if (localPackagesMessages) {
    lintedAnything = true;
    lintingMessages.merge(localPackagesMessages);
  }

  // if there was no linting performed since there are no applicable
  // linters for neither app nor packages, just return null
  return lintedAnything ? lintingMessages : null;
}

// Make a JsImage object (a complete, linked, ready-to-go JavaScript
// program). It can either be loaded into memory with load(), which
// returns the `Package` object inside the plugin's namespace, or
// saved to disk with write(builder).
//
// Returns an object with keys:
// - image: The created JsImage object.
// - watchSet: Source file WatchSet (see bundle()).
// - usedPackageNames: array of names of packages that are used
//
// XXX return an 'errors' key for symmetry with bundle(), rather than
// letting exceptions escape?
//
// options:
// - packageMap: required. the PackageMap for resolving
//   bundle-time dependencies
// - isopackCache: required. IsopackCache with all dependent packages
//   loaded
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
exports.buildJsImage = Profile("bundler.buildJsImage", function (options) {
  buildmessage.assertInCapture();
  if (options.npmDependencies && ! options.npmDir) {
    throw new Error("Must indicate .npm directory to use");
  }
  if (! options.name) {
    throw new Error("Must provide a name");
  }

  var packageSource = new PackageSource;

  packageSource.initFromOptions(options.name, {
    kind: "plugin",
    use: options.use || [],
    sourceRoot: options.sourceRoot,
    sources: options.sources || [],
    // it is correct to set slash and not files.pathSep because serverRoot is a
    // url path and not a file system path
    serveRoot: options.serveRoot || '/',
    npmDependencies: options.npmDependencies,
    npmDir: options.npmDir,
    localNodeModulesDirs: options.localNodeModulesDirs,
  });

  var isopack = compiler.compile(packageSource, {
    packageMap: options.packageMap,
    isopackCache: options.isopackCache,
    // There's no web.cordova unibuild here anyway, just os.
    includeCordovaUnibuild: false
  });

  var target = new JsImageTarget({
    packageMap: options.packageMap,
    isopackCache: options.isopackCache,
    sourceRoot: packageSource.sourceRoot,
    // This function does not yet support cross-compilation (neither does
    // initFromOptions). That's OK for now since we're only trying to support
    // cross-bundling, not cross-package-building, and this function is only
    // used to build plugins (during package build) and for isopack.load
    // (which always wants to build for the current host).
    arch: archinfo.host()
  });
  target.make({ packages: [isopack] });

  return {
    image: target.toJsImage(),
    watchSet: target.getWatchSet(),
    usedPackageNames: _.keys(target.usedPackages)
  };
});

// Load a JsImage from disk (that was previously written by calling
// write() on a JsImage). `controlFilePath` is the path to the control
// file (eg, program.json).
exports.readJsImage = Profile(
  "bundler.readJsImage", function (controlFilePath) {
  return JsImage.readFromDisk(controlFilePath);
});
