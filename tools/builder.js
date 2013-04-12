var path = require('path');
var files = require(path.join(__dirname, 'files.js'));
var fs = require('fs');
var _ = require('underscore');
var crypto = require('crypto');

var sha1 = function (contents) {
  var hash = crypto.createHash('sha1');
  hash.update(contents);
  return hash.digest('hex');
};

// Builder encapsulates much of the file-handling logic need to create
// "bundles" (directory trees such as site archives, programs, or
// packages.) It can create a temporary directory in which to build
// the bundle, moving the bundle atomically into place when and if the
// build successfully completes; sanitize and generate unique
// filenames; and track dependencies (files that should be watched for
// changes when developing interactively.)
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

  // Files already written to. Map from canonicalized relPath (no
  // trailing slash) to true.
  self.used = {};

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

  self.dependencyInfo = { directories: {}, files: {} };

  // XXX cleaner error handling. don't make the humans read an
  // exception (and, make suitable for use in automated systems)
};

_.extend(Builder.prototype, {
  // Write either a buffer or the contents of a file to `relPath` (a
  // path to a file relative to the bundle root), creating it (and any
  // enclosing directories) if it doesn't exist yet.
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
  //
  // Returns the final canonicalize relPath that was written to.
  //
  // If data was a filename then a dependency will be added on that
  // file.
  write: function (relPath, options) {
    var self = this;
    options = options || {};

    // Ensure no trailing slash
    if (relPath.slice(-1) === path.sep)
      relPath = slice(0, -1);

    if (self.used[relPath] && ! options.append)
      throw new Error("File already exists in bundle: '" + relPath + "'");

    // In sanitize mode, ensure path does not contain segments like
    // '..', does not contain forbidden characters, and is unique.
    if (options.sanitize) {
      relPath =
        _.map(relPath.split(path.sep), function (part) {
          if (part.match(/^\.*$/))
            throw new Error("Path contains forbidden segment '" + part + "'");
          return part.replace(/[^a-zA-Z0-9._-]/g, '');
        }).join(path.sep);

      var suffix = '';
      while (self.used[relPath + suffix])
        suffix++; // first increment will do '' -> 1
      relPath = relPath + suffix;
    }

    var data;
    if (options.data) {
      if (! (options.data instanceof Buffer))
        throw new Error("data must be a Buffer");
      if (options.file)
        throw new Error("May only pass one of data and file, not both");
      data = options.data;
    } else if (options.file) {
      var sourcePath = path.resolve(options.file);
      data = fs.readFileSync(sourcePath);
      self.dependencyInfo.files[sourcePath] = sha1(data);
    }

    var absPath = path.join(self.buildPath, relPath);
    files.mkdir_p(path.dirname(absPath), 0755);
    if (options.append)
      fs.appendFileSync(absPath, data);
    else
      fs.writeFileSync(absPath, data);
    self.used[relPath] = true;

    return relPath;
  },

  // Serialize `data` as JSON and write it to `relPath` (a path to a
  // file relative to the bundle root), creating parent directories as
  // necessary. Throw an exception if the file already exists.
  writeJson: function (relPath, data) {
    var self = this;

    // Ensure no trailing slash
    if (relPath.slice(-1) === path.sep)
      relPath = slice(0, -1);

    if (self.used[relPath])
      throw new Error("File already exists in bundle: '" + relPath + "'");

    fs.writeFileSync(path.join(self.buildPath, relPath),
                     new Buffer(JSON.stringify(data, null, 2), 'utf8'));

    self.used[relPath] = true;
  },

  // Add relPath to the list of "already taken" paths in the
  // bundle. This will cause writeFile, when in sanitize mode, to
  // never pick this filename. Calling this twice on the same relPath
  // will given an exception.
  reserve: function (relPath) {
    var self = this;

    // Ensure no trailing slash
    if (relPath.slice(-1) === path.sep)
      relPath = slice(0, -1);

    if (relPath in self.used)
      throw new Error("Path reserved twice: " + relPath);
    self.used[relPath] = true;
  },

  // Recursively copy a directory and all of its contents into the
  // bundle. But if the symlink option was passed to the Builder
  // constructor, then make a symlink instead, if possible.
  //
  // Adds dependencies both on the files that were copied, and on the
  // contents of the directory tree (respecting 'ignore'.) Disable
  // this with depend: false.
  //
  // Options:
  // - from: source path on local disk to copy from
  // - to: relative path to a directory in the bundle that will
  //   receive the files
  // - ignore: array of regexps of filenames (that is, basenames) to
  //   ignore (they may still be visible in the output bundle if
  //   symlinks are being used)
  // - depend: Should dependencies be added? Defaults to true.
  copyDirectory: function (options) {
    var self = this;
    options = options || {};

    var createDependencies =
      ('depend' in options) ? options.depend : true;

    var absPathTo = path.join(self.buildPath, options.to);
    if (self.shouldSymlink && ! fs.existsSync(absPathTo)) {
      files.mkdir_p(path.dirname(absPathTo));
      fs.symlinkSync(path.resolve(options.from),
                     absPathTo);
      return;
    }

    var ignore = options.ignore || [];
    if (createDependencies) {
      self.dependencyInfo.directories[absPathTo] = {
        include: [/.?/],
        exclude: ignore
      };
    }

    var walk = function (absFrom, relTo) {
      files.mkdir_p(path.resolve(self.buildPath, relTo), 0755);

      _.each(fs.readdirSync(absFrom), function (item) {
        if (_.any(ignore, function (pattern) {
          return item.match(pattern);
        })) return; // skip excluded files

        var thisAbsFrom = path.resolve(absFrom, item);
        var thisRelTo = path.join(relTo, item);
        if (fs.statSync(thisAbsFrom).isDirectory()) {
          walk(thisAbsFrom, thisRelTo);
          return;
        }

        // XXX avoid reading whole file into memory
        var data = fs.readFileSync(thisAbsFrom);

        if (createDependencies)
          self.dependencyInfo.files[thisAbsFrom] = sha1(data);

        fs.writeFileSync(path.resolve(self.buildPath, thisRelTo), data);
        self.used[thisRelTo] = true;
      });
    };

    walk(options.from, options.to);
  },

  // Returns a new Builder-compatible object that works just like a
  // Builder, but interprets all paths relative to 'relPath', a path
  // relative to the bundle root.
  //
  // The sub-builder returned does not have all Builder methods (for
  // example, complete() wouldn't make sense) and you should not rely
  // on it beig instanceof Builder.
  enter: function (relPath) {
    var self = this;
    var methods = ["write", "writeJson", "reserve", "copyDirectory",
                   "enter"];
    var ret = {};

    _.each(methods, function (method) {
      ret[method] = function (/* arguments */) {
        args = _.toArray(arguments);

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

        return self[method].apply(self, args);
      };
    });

    return ret;
  },

  // Move the completed bundle into its final location (outputPath)
  complete: function () {
    var self = this;
    files.rm_recursive(self.outputPath);
    fs.renameSync(self.buildPath, self.outputPath);
  },

  // Delete the partially-completed bundle. Do not disturb outputPath.
  abort: function () {
    var self = this;
    files.rm_recursive(self.buildPath);
  },

  // Return all dependency info that has accumulated, in the format
  // expected by watch.Watcher.
  getDependencyInfo: function () {
    var self = this;
    return self.dependencyInfo;
  }
});

// static convenience method
Builder.sha1 = sha1;

module.exports = Builder;

