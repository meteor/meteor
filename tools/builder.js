var path = require('path');
var files = require(path.join(__dirname, 'files.js'));
var watch = require('./watch.js');
var fs = require('fs');
var _ = require('underscore');

var sha1 = function (contents) {
  var crypto = require('crypto');
  var hash = crypto.createHash('sha1');
  hash.update(contents);
  return hash.digest('hex');
};

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
//  - symlink: if true, symlink rather than copy files/directories
//    where possible. This is faster and takes up less disk space but
//    produces a bundle that can't run elsewhere, and also that will
//    reflect changes to the input files in realtime (we don't care
//    about that, at least in development mode, since we reload on
//    change anyway..)
var Builder = function (options) {
  var self = this;
  options = options || {};

  self.outputPath = options.outputPath;

  // Paths already written to. Map from canonicalized relPath (no
  // trailing slash) to true for a file, or false for a directory.
  self.usedAsFile = { '': false, '.': false };

  self.shouldSymlink = !! options.symlink;

  // foo/bar => foo/.build1234.bar
  // Should we include a random number? The advantage is that multiple
  // builds can run in parallel. The disadvantage is that stale build
  // files hang around forever. For now, go with the former.
  var nonce = Math.floor(Math.random() * 999999);
  self.buildPath = path.join(path.dirname(self.outputPath),
                             '.build' + nonce + "." +
                             path.basename(self.outputPath));
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
  _ensureDirectory: function (relPath) {
    var self = this;

    var parts = path.normalize(relPath).split(path.sep);
    if (parts.length > 1 && parts[parts.length - 1] === '')
      parts.pop(); // remove trailing slash

    var partsSoFar = [];
    _.each(parts, function (part) {
      partsSoFar.push(part);
      var partial = partsSoFar.join(path.sep);
      if (! (partial in self.usedAsFile)) {
        // It's new -- create it
        fs.mkdirSync(path.join(self.buildPath, partial), 0755);
        self.usedAsFile[partial] = false;
      } else if (self.usedAsFile[partial]) {
        // Already exists and is a file. Oops.
        throw new Error("tried to make " + relPath + " a directory but " +
                        partial + " is already a file");
      } else {
        // Already exists and is a directory
      }
    });
  },

  // isDirectory defaults to false
  _sanitize: function (relPath, isDirectory) {
    var self = this;

    var parts = relPath.split(path.sep);
    var partsOut = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var shouldBeFile = (i === parts.length - 1) && ! isDirectory;

      // Basic sanitization
      if (part.match(/^\.+$/))
        throw new Error("Path contains forbidden segment '" + part + "'");
      part = part.replace(/[^a-zA-Z0-9._-]/g, '');

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
        var candidate = path.join(partsOut.join(path.sep), part + suffix + ext);
        if (candidate.length &&
            (! (candidate in self.usedAsFile) ||
             (!shouldBeFile && !self.usedAsFile[candidate])))
          // No conflict -- either not used, or it's two paths that
          // share a common ancestor directory (as opposed to one path
          // thinking that a/b should be a file, and another thinking
          // that it should be a directory)
          break;

        suffix++; // first increment will do '' -> 1
      }

      partsOut.push(part + suffix + ext);
    }

    return partsOut.join(path.sep);
  },

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
  // - append: if true, append to the file if it exists rather than
  //   throwing an exception.
  // - executable: if true, mark the file as executable.
  //
  // Returns the final canonicalize relPath that was written to.
  //
  // If `file` is used then it will be added to the builder's WatchSet.
  write: function (relPath, options) {
    var self = this;
    options = options || {};

    // Ensure no trailing slash
    if (relPath.slice(-1) === path.sep)
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
      data = watch.readAndWatchFile(self.watchSet, path.resolve(options.file));
    }

    self._ensureDirectory(path.dirname(relPath));
    var absPath = path.join(self.buildPath, relPath);
    if (options.append)
      fs.appendFileSync(absPath, data);
    else
      fs.writeFileSync(absPath, data);
    self.usedAsFile[relPath] = true;

    if (options.executable)
      fs.chmodSync(absPath, 0755); // rwxr-xr-x

    return relPath;
  },

  // Serialize `data` as JSON and write it to `relPath` (a path to a
  // file relative to the bundle root), creating parent directories as
  // necessary. Throw an exception if the file already exists.
  writeJson: function (relPath, data) {
    var self = this;

    // Ensure no trailing slash
    if (relPath.slice(-1) === path.sep)
      relPath = relPath.slice(0, -1);

    self._ensureDirectory(path.dirname(relPath));
    fs.writeFileSync(path.join(self.buildPath, relPath),
                     new Buffer(JSON.stringify(data, null, 2), 'utf8'));

    self.usedAsFile[relPath] = true;
  },

  // Add relPath to the list of "already taken" paths in the
  // bundle. This will cause write, when in sanitize mode, to never
  // pick this filename (and will prevent files that from being
  // written that would conflict with paths that we are expecting to
  // be directories). Calling this twice on the same relPath will
  // given an exception.
  //
  // options:
  // - directory: set to true to reserve this relPath to be a
  //   directory rather than a file.
  reserve: function (relPath, options) {
    var self = this;
    options = options || {};

    // Ensure no trailing slash
    if (relPath.slice(-1) === path.sep)
      relPath = relPath.slice(0, -1);

    var parts = relPath.split(path.sep);
    var partsSoFar = [];
    for (var i = 0; i < parts.length; i ++) {
      var part = parts[i];
      partsSoFar.push(part);
      var soFar = partsSoFar.join(path.sep);
      if (self.usedAsFile[soFar])
        throw new Error("Path reservation conflict: " + relPath);

      var shouldBeDirectory = (i < parts.length - 1) || options.directory;
      if (shouldBeDirectory) {
        if (! (soFar in self.usedAsFile)) {
          fs.mkdirSync(path.join(self.buildPath, soFar), 0755);
          self.usedAsFile[soFar] = false;
        }
      } else {
        self.usedAsFile[soFar] = true;
      }
    }
  },

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
  generateFilename: function (relPath, options) {
    var self = this;
    options = options || {};

    relPath = self._sanitize(relPath, options.directory);
    self.reserve(relPath, { directory: options.directory });
    return relPath;
  },

  // Convenience wrapper around generateFilename and write.
  //
  // (Note that in the object returned by builder.enter, this method
  // is patched through directly rather than rewriting its inputs and
  // outputs. This is only valid because it does nothing with its inputs
  // and outputs other than send pass them to other methods.)
  writeToGeneratedFilename: function (relPath, writeOptions) {
    var self = this;
    var generated = self.generateFilename(relPath);
    self.write(generated, writeOptions);
    return generated;
  },

  // Recursively copy a directory and all of its contents into the
  // bundle. But if the symlink option was passed to the Builder
  // constructor, then make a symlink instead, if possible.
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
  copyDirectory: function (options) {
    var self = this;
    options = options || {};

    var normOptionsTo = options.to;
    if (normOptionsTo.slice(-1) === path.sep)
      normOptionsTo = normOptionsTo.slice(0, -1);

    var absPathTo = path.join(self.buildPath, normOptionsTo);
    if (self.shouldSymlink) {
      var canSymlink = true;
      if (self.usedAsFile[normOptionsTo]) {
        throw new Error("tried to copy a directory onto " + normOptionsTo +
                        " but it is is already a file");
      } else if (normOptionsTo in self.usedAsFile) {
        // It's already here and is a directory, maybe because of a call to
        // reserve with {directory: true}. If it's an empty directory, this is
        // salvageable. The directory should exist, because all code paths which
        // set usedAsFile to false create the directory.
        //
        // XXX This is somewhat broken: what if the reason we're in
        // self.usedAsFile is because an immediate child of ours was reserved as
        // a file but not actually written yet?
        var children = fs.readdirSync(absPathTo);
        if (_.isEmpty(children)) {
          fs.rmdirSync(absPathTo);
        } else {
          canSymlink = false;
        }
      }

      if (canSymlink) {
        self._ensureDirectory(path.dirname(normOptionsTo));
        fs.symlinkSync(path.resolve(options.from), absPathTo);
        return;
      }
    }

    var ignore = options.ignore || [];

    var walk = function (absFrom, relTo) {
      self._ensureDirectory(relTo);

      _.each(fs.readdirSync(absFrom), function (item) {
        var thisAbsFrom = path.resolve(absFrom, item);
        var thisRelTo = path.join(relTo, item);

        var fileStatus = fs.statSync(thisAbsFrom);
        var isDir = fileStatus.isDirectory();
        var itemForMatch = item;
        if (isDir)
          itemForMatch += '/';

        if (_.any(ignore, function (pattern) {
          return itemForMatch.match(pattern);
        })) return; // skip excluded files

        if (isDir) {
          walk(thisAbsFrom, thisRelTo);
          return;
        }

        // XXX avoid reading whole file into memory
        var data = fs.readFileSync(thisAbsFrom);

        fs.writeFileSync(path.resolve(self.buildPath, thisRelTo), data,
                         { mode: fileStatus.mode });
        self.usedAsFile[thisRelTo] = true;
      });
    };

    walk(options.from, normOptionsTo);
  },

  // Returns a new Builder-compatible object that works just like a
  // Builder, but interprets all paths relative to 'relPath', a path
  // relative to the bundle root which should not start with a '/'.
  //
  // The sub-builder returned does not have all Builder methods (for
  // example, complete() wouldn't make sense) and you should not rely
  // on it being instanceof Builder.
  enter: function (relPath) {
    var self = this;
    var methods = ["write", "writeJson", "reserve", "generateFilename",
                   "copyDirectory", "enter"];
    var subBuilder = {};
    var relPathWithSep = relPath + path.sep;

    _.each(methods, function (method) {
      subBuilder[method] = function (/* arguments */) {
        var args = _.toArray(arguments);

        if (method !== "copyDirectory") {
          // Normal method (relPath as first argument)
          args = _.clone(args);
          args[0] = path.join(relPath, args[0]);
        } else {
          // with copyDirectory the path we have to fix up is inside
          // an options hash
          args[0] = _.clone(args[0]);
          args[0].to = path.join(relPath, args[0].to);
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
  },

  // Move the completed bundle into its final location (outputPath)
  complete: function () {
    var self = this;
    // XXX Alternatively, we could just keep buildPath around, and make
    // outputPath be a symlink pointing to it. This doesn't work for the NPM use
    // case of renameDirAlmostAtomically since that one is constructing files to
    // be checked in to version control, but here we could get away with it.
    files.renameDirAlmostAtomically(self.buildPath, self.outputPath);
  },

  // Delete the partially-completed bundle. Do not disturb outputPath.
  abort: function () {
    var self = this;
    files.rm_recursive(self.buildPath);
  },

  // Returns a WatchSet representing all files that were read from disk by the
  // builder.
  getWatchSet: function () {
    var self = this;
    return self.watchSet;
  }
});

// static convenience method
Builder.sha1 = sha1;

module.exports = Builder;
