var watch = require('./watch.js');
var files = require('./files.js');
var NpmDiscards = require('./npm-discards.js');
var Profile = require('./profile.js').Profile;
var _ = require('underscore');

// Builder encapsulates much of the file-handling logic need to create
// "bundles" (directory trees such as site archives, programs, or
// packages). It can create a temporary directory in which to build
// the bundle, moving the bundle atomically into place when and if the
// build successfully completes; sanitize and generate unique
// filenames; and track dependencies (files that should be watched for
// changes when developing interactively).
//
// Options:
//  - outputPath: Required. Path to the directory that will hold the
//    bundle when building is complete. It should not exist. Its
//    parents will be created if necessary.
var Builder = function (options) {
  var self = this;
  options = options || {};

  self.outputPath = options.outputPath;

  // Paths already written to. Map from canonicalized relPath (no
  // trailing slash) to true for a file, or false for a directory.
  self.usedAsFile = { '': false, '.': false };

  // foo/bar => foo/.build1234.bar
  // Should we include a random number? The advantage is that multiple
  // builds can run in parallel. The disadvantage is that stale build
  // files hang around forever. For now, go with the former.
  var nonce = Math.floor(Math.random() * 999999);
  self.buildPath = files.pathJoin(files.pathDirname(self.outputPath),
                                  '.build' + nonce + "." +
                                    files.pathBasename(self.outputPath));
  files.rm_recursive(self.buildPath);
  files.mkdir_p(self.buildPath, 0755);

  self.watchSet = new watch.WatchSet();

  // XXX cleaner error handling. don't make the humans read an
  // exception (and, make suitable for use in automated systems)
};

_.extend(Builder.prototype, {
  // Like mkdir_p, but records in self.usedAsFile that we have created
  // the directories, and takes a path relative to the bundle
  // root. Throws an exception on failure.
  _ensureDirectory: Profile("Builder#_ensureDirectory", function (relPath) {
    var self = this;

    var parts = files.pathNormalize(relPath).split(files.pathSep);
    if (parts.length > 1 && parts[parts.length - 1] === '')
      parts.pop(); // remove trailing slash

    var partsSoFar = [];
    _.each(parts, function (part) {
      partsSoFar.push(part);
      var partial = partsSoFar.join(files.pathSep);
      if (! (partial in self.usedAsFile)) {
        // It's new -- create it
        files.mkdir(files.pathJoin(self.buildPath, partial), 0755);
        self.usedAsFile[partial] = false;
      } else if (self.usedAsFile[partial]) {
        // Already exists and is a file. Oops.
        throw new Error("tried to make " + relPath + " a directory but " +
                        partial + " is already a file");
      } else {
        // Already exists and is a directory
      }
    });
  }),

  // isDirectory defaults to false
  _sanitize: Profile("Builder#_sanitize", function (relPath, isDirectory) {
    var self = this;

    var parts = relPath.split(files.pathSep);
    var partsOut = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var shouldBeFile = (i === parts.length - 1) && ! isDirectory;
      var mustBeUnique = (i === parts.length - 1);

      // Basic sanitization
      if (part.match(/^\.+$/))
        throw new Error("Path contains forbidden segment '" + part + "'");

      part = part.replace(/[^a-zA-Z0-9._\:-]/g, '');

      // If at last component, pull extension (if any) off of part
      var ext = '';
      if (shouldBeFile) {
        var split = part.split('.');
        if (split.length > 1)
          ext = "." + split.pop();
        part = split.join('.');
      }

      // Make sure it's sufficiently unique
      var suffix = '';
      while (true) {
        var candidate = files.pathJoin(partsOut.join(files.pathSep), part + suffix + ext);
        if (candidate.length) {
          // If we've never heard of this, then it's unique enough.
          if (!_.has(self.usedAsFile, candidate))
            break;
          // If we want this bit to be a directory, and we don't need it to be
          // unique (ie, it isn't the very last bit), and it's currently a
          // directory, then that's OK.
          if (!(mustBeUnique || self.usedAsFile[candidate]))
            break;
          // OK, either we want it to be unique and it already exists; or it is
          // currently a file (and we want it to be either a different file or a
          // directory).  Try a new suffix.
        }

        suffix++; // first increment will do '' -> 1
      }

      partsOut.push(part + suffix + ext);
    }

    return partsOut.join(files.pathSep);
  }),

  // Write either a buffer or the contents of a file to `relPath` (a
  // path to a file relative to the bundle root), creating it (and any
  // enclosing directories) if it doesn't exist yet. Exactly one of
  // `data` and or `file` must be passed.
  //
  // Options:
  // - data: a Buffer to write to relPath.
  // - file: a filename to write to relPath, as a string.
  // - sanitize: if true, then all components of the path are stripped
  //   of any potentially troubling characters, an exception is thrown
  //   if any path segments consist entirely of dots (eg, '..'), and
  //   if there is a file in the bundle with the same relPath, then
  //   the path is changed by adding a numeric suffix.
  // - executable: if true, mark the file as executable.
  // - symlink: if set to a string, create a symlink to its value
  //
  // Returns the final canonicalize relPath that was written to.
  //
  // If `file` is used then it will be added to the builder's WatchSet.
  write: Profile("Builder#write", function (relPath, options) {
    var self = this;
    options = options || {};

    // Ensure no trailing slash
    if (relPath.slice(-1) === files.pathSep)
      relPath = relPath.slice(0, -1);

    // In sanitize mode, ensure path does not contain segments like
    // '..', does not contain forbidden characters, and is unique.
    if (options.sanitize)
      relPath = self._sanitize(relPath);

    var data;
    if (options.data) {
      if (! (options.data instanceof Buffer))
        throw new Error("data must be a Buffer");
      if (options.file)
        throw new Error("May only pass one of data and file, not both");
      data = options.data;
    } else if (options.file) {
      data =
        watch.readAndWatchFile(self.watchSet, files.pathResolve(options.file));
    }

    self._ensureDirectory(files.pathDirname(relPath));
    var absPath = files.pathJoin(self.buildPath, relPath);

    if (options.symlink) {
      files.symlink(options.symlink, absPath);
    } else {
      // Builder is used to create build products, which should be read-only;
      // users shouldn't be manually editing automatically generated files and
      // expecting the results to "stick".
      files.writeFile(absPath, data,
                       { mode: options.executable ? 0555 : 0444 });
    }
    self.usedAsFile[relPath] = true;

    return relPath;
  }),

  // Serialize `data` as JSON and write it to `relPath` (a path to a
  // file relative to the bundle root), creating parent directories as
  // necessary. Throw an exception if the file already exists.
  writeJson: Profile("Builder#writeJson", function (relPath, data) {
    var self = this;

    // Ensure no trailing slash
    if (relPath.slice(-1) === files.pathSep)
      relPath = relPath.slice(0, -1);

    self._ensureDirectory(files.pathDirname(relPath));
    files.writeFile(files.pathJoin(self.buildPath, relPath),
                     new Buffer(JSON.stringify(data, null, 2), 'utf8'),
                     {mode: 0444});

    self.usedAsFile[relPath] = true;
  }),

  // Add relPath to the list of "already taken" paths in the
  // bundle. This will cause write, when in sanitize mode, to never
  // pick this filename (and will prevent files that from being
  // written that would conflict with paths that we are expecting to
  // be directories). Calling this twice on the same relPath will
  // given an exception.
  //
  // Returns the *current* (temporary!) path to where the file or directory
  // lives. This is so you could use non-builder code to write into a reserved
  // directory.
  //
  // options:
  // - directory: set to true to reserve this relPath to be a
  //   directory rather than a file.
  reserve: Profile("Builder#reserve", function (relPath, options) {
    var self = this;
    options = options || {};

    // Ensure no trailing slash
    if (relPath.slice(-1) === files.pathSep)
      relPath = relPath.slice(0, -1);

    var parts = relPath.split(files.pathSep);
    var partsSoFar = [];
    for (var i = 0; i < parts.length; i ++) {
      var part = parts[i];
      partsSoFar.push(part);
      var soFar = partsSoFar.join(files.pathSep);
      if (self.usedAsFile[soFar])
        throw new Error("Path reservation conflict: " + relPath);

      var shouldBeDirectory = (i < parts.length - 1) || options.directory;
      if (shouldBeDirectory) {
        if (! (soFar in self.usedAsFile)) {
          files.mkdir(files.pathJoin(self.buildPath, soFar), 0755);
          self.usedAsFile[soFar] = false;
        }
      } else {
        self.usedAsFile[soFar] = true;
      }
    }

    // Return the path we reserved.
    return files.pathJoin(self.buildPath, relPath);
  }),

  // Generate and reserve a unique name for a file based on `relPath`,
  // and return it. If `relPath` is available (there is no file with
  // that name currently existing or reserved, it doesn't contain
  // forbidden characters, a prefix of it is not already in use as a
  // file rather than a directory) then the return value will be
  // `relPath`. Otherwise relPath will be modified to get the return
  // value, say by adding a numeric suffix to some path components
  // (preserving the file extension however) and deleting forbidden
  // characters. Throws an exception if relPath contains any segments
  // that are all dots (eg, '..').
  //
  // options:
  //
  // - directory: generate (and reserve) a name for a directory,
  //   rather than a file.
  generateFilename: Profile(
    "Builder#generateFilename", function (relPath, options) {
    var self = this;
    options = options || {};

    relPath = self._sanitize(relPath, options.directory);
    self.reserve(relPath, { directory: options.directory });
    return relPath;
  }),

  // Convenience wrapper around generateFilename and write.
  //
  // (Note that in the object returned by builder.enter, this method
  // is patched through directly rather than rewriting its inputs and
  // outputs. This is only valid because it does nothing with its inputs
  // and outputs other than send pass them to other methods.)
  writeToGeneratedFilename: Profile(
    "Builder#writeToGeneratedFilename", function (relPath, writeOptions) {
    var self = this;
    var generated = self.generateFilename(relPath);
    self.write(generated, writeOptions);
    return generated;
  }),

  // Recursively copy a directory and all of its contents into the
  // bundle. But if the symlink option was passed to the Builder
  // constructor, then make a symlink instead, if possible.
  //
  // Unlike with files.cp_r, if a symlink is found, it is copied as a symlink.
  //
  // This does NOT add anything to the WatchSet.
  //
  // Options:
  // - from: source path on local disk to copy from
  // - to: relative path to a directory in the bundle that will
  //   receive the files
  // - ignore: array of regexps of filenames (that is, basenames) to
  //   ignore (they may still be visible in the output bundle if
  //   symlinks are being used).  Like with WatchSets, they match against
  //   entries that end with a slash if it's a directory.
  // - specificFiles: just copy these paths (specified as relative to 'to').
  // - symlink: true if the directory should be symlinked instead of copying
  copyDirectory: Profile("Builder#copyDirectory", function (options) {
    var self = this;
    options = options || {};

    var normOptionsTo = options.to;
    if (normOptionsTo.slice(-1) === files.pathSep)
      normOptionsTo = normOptionsTo.slice(0, -1);

    var absPathTo = files.pathJoin(self.buildPath, normOptionsTo);
    if (options.symlink) {
      if (options.specificFiles) {
        throw new Error("can't copy only specific paths with a single symlink");
      }

      if (self.usedAsFile[normOptionsTo]) {
        throw new Error("tried to copy a directory onto " + normOptionsTo +
                        " but it is is already a file");
      }

      var canSymlink = true;
      // Symlinks don't work exactly the same way on Windows, and furthermore
      // they request Admin permissions to set.
      if (process.platform === 'win32') {
        canSymlink = false;
      } else if (normOptionsTo in self.usedAsFile) {
        // It's already here and is a directory, maybe because of a call to
        // reserve with {directory: true}. If it's an empty directory, this is
        // salvageable. The directory should exist, because all code paths which
        // set usedAsFile to false create the directory.
        //
        // XXX This is somewhat broken: what if the reason we're in
        // self.usedAsFile is because an immediate child of ours was reserved as
        // a file but not actually written yet?
        var children = files.readdir(absPathTo);
        if (_.isEmpty(children)) {
          files.rmdir(absPathTo);
        } else {
          canSymlink = false;
        }
      }

      if (canSymlink) {
        self._ensureDirectory(files.pathDirname(normOptionsTo));
        files.symlink(files.pathResolve(options.from), absPathTo);
        return;
      }
    }

    var ignore = options.ignore || [];
    var specificPaths = null;
    if (options.specificFiles) {
      specificPaths = {};
      _.each(options.specificFiles, function (f) {
        while (f !== '.') {
          specificPaths[files.pathJoin(normOptionsTo, f)] = true;
          f = files.pathDirname(f);
        }
      });
    }

    var walk = function (absFrom, relTo) {
      self._ensureDirectory(relTo);

      _.each(files.readdir(absFrom), function (item) {
        var thisAbsFrom = files.pathResolve(absFrom, item);
        var thisRelTo = files.pathJoin(relTo, item);

        if (specificPaths && !_.has(specificPaths, thisRelTo)) {
          return;
        }

        var fileStatus = files.lstat(thisAbsFrom);

        var itemForMatch = item;
        var isDirectory = fileStatus.isDirectory();
        if (isDirectory) {
          itemForMatch += '/';
        }

        if (_.any(ignore, function (pattern) {
          return itemForMatch.match(pattern);
        })) return; // skip excluded files

        if (options.npmDiscards instanceof NpmDiscards &&
            options.npmDiscards.shouldDiscard(thisAbsFrom, isDirectory)) {
          return;
        }

        if (isDirectory) {
          walk(thisAbsFrom, thisRelTo);
        } else if (fileStatus.isSymbolicLink()) {
          files.symlink(files.readlink(thisAbsFrom),
                         files.pathResolve(self.buildPath, thisRelTo));
          // A symlink counts as a file, as far as "can you put something under
          // it" goes.
          self.usedAsFile[thisRelTo] = true;
        } else {
          files.copyFile(thisAbsFrom,
                         files.pathResolve(self.buildPath, thisRelTo),
                         fileStatus.mode);
          self.usedAsFile[thisRelTo] = true;
        }
      });
    };

    walk(options.from, normOptionsTo);
  }),

  // Returns a new Builder-compatible object that works just like a
  // Builder, but interprets all paths relative to 'relPath', a path
  // relative to the bundle root which should not start with a '/'.
  //
  // The sub-builder returned does not have all Builder methods (for
  // example, complete() wouldn't make sense) and you should not rely
  // on it being instanceof Builder.
  enter: Profile("Builder#enter", function (relPath) {
    var self = this;
    var methods = ["write", "writeJson", "reserve", "generateFilename",
                   "copyDirectory", "enter"];
    var subBuilder = {};
    var relPathWithSep = relPath + files.pathSep;

    _.each(methods, function (method) {
      subBuilder[method] = function (/* arguments */) {
        var args = _.toArray(arguments);

        if (method !== "copyDirectory") {
          // Normal method (relPath as first argument)
          args = _.clone(args);
          args[0] = files.pathJoin(relPath, args[0]);
        } else {
          // with copyDirectory the path we have to fix up is inside
          // an options hash
          args[0] = _.clone(args[0]);
          args[0].to = files.pathJoin(relPath, args[0].to);
        }

        var ret = self[method].apply(self, args);

        if (method === "generateFilename") {
          // fix up the returned path to be relative to the
          // sub-bundle, not the parent bundle
          if (ret.substr(0, 1) === '/')
            ret = ret.substr(1);
          if (ret.substr(0, relPathWithSep.length) !== relPathWithSep)
            throw new Error("generateFilename returned path outside of " +
                            "sub-bundle?");
          ret = ret.substr(relPathWithSep.length);
        }

        return ret;
      };
    });

    // Methods that don't have to fix up arguments or return values, because
    // they are implemented purely in terms of other methods which do.
    var passThroughMethods = ["writeToGeneratedFilename"];
    _.each(passThroughMethods, function (method) {
      subBuilder[method] = self[method];
    });

    return subBuilder;
  }),

  // Move the completed bundle into its final location (outputPath)
  complete: Profile("Builder#complete", function () {
    var self = this;

    // XXX Alternatively, we could just keep buildPath around, and make
    // outputPath be a symlink pointing to it. This doesn't work for the NPM use
    // case of renameDirAlmostAtomically since that one is constructing files to
    // be checked in to version control, but here we could get away with it.
    files.renameDirAlmostAtomically(self.buildPath, self.outputPath);
  }),

  // Delete the partially-completed bundle. Do not disturb outputPath.
  abort: Profile("Builder#abort", function () {
    var self = this;
    files.rm_recursive(self.buildPath);
  }),

  // Returns a WatchSet representing all files that were read from disk by the
  // builder.
  getWatchSet: function () {
    var self = this;
    return self.watchSet;
  }
});

module.exports = Builder;
