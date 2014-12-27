///
/// utility functions for files and directories. includes both generic
/// helper functions (such as rm_recursive), and meteor-specific ones
/// (such as testing whether an directory is a meteor app)
///

var fs = require("fs");
var path = require('path');
var os = require('os');
var util = require('util');
var _ = require('underscore');
var Fiber = require('fibers');
var Future = require('fibers/future');
var sourcemap = require('source-map');
var sourcemap_support = require('source-map-support');

var utils = require('./utils.js');
var cleanup = require('./cleanup.js');
var buildmessage = require('./buildmessage.js');
var watch = require('./watch.js');

var files = exports;

var parsedSourceMaps = {};
var nextStackFilenameCounter = 1;
var retrieveSourceMap = function (pathForSourceMap) {
  if (_.has(parsedSourceMaps, pathForSourceMap))
    return {map: parsedSourceMaps[pathForSourceMap]};
  return null;
};

sourcemap_support.install({
  // Use the source maps specified to runJavaScript instead of parsing source
  // code for them.
  retrieveSourceMap: retrieveSourceMap,
  // For now, don't fix the source line in uncaught exceptions, because we
  // haven't fixed handleUncaughtExceptions in source-map-support to properly
  // locate the source files.
  handleUncaughtExceptions: false
});

// given a predicate function and a starting path, traverse upwards
// from the path until we find a path that satisfies the predicate.
//
// returns either the path to the lowest level directory that passed
// the test or null for none found. if starting path isn't given, use
// cwd.
var findUpwards = function (predicate, startPath) {
  var testDir = startPath || process.cwd();
  while (testDir) {
    if (predicate(testDir)) {
      break;
    }
    var newDir = path.dirname(testDir);
    if (newDir === testDir) {
      testDir = null;
    } else {
      testDir = newDir;
    }
  }
  if (!testDir)
    return null;

  return testDir;
};

// Determine if 'filepath' (a path, or omit for cwd) is within an app
// directory. If so, return the top-level app directory.
files.findAppDir = function (filepath) {
  var isAppDir = function (filepath) {
    // XXX once we are done with the transition to engine, this should
    // change to: `return files.exists(path.join(filepath, '.meteor',
    // 'release'))`

    // .meteor/packages can be a directory, if .meteor is a warehouse
    // directory.  since installing meteor initializes a warehouse at
    // $HOME/.meteor, we want to make sure your home directory (and all
    // subdirectories therein) don't count as being within a meteor app.
    try { // use try/catch to avoid the additional syscall to files.exists
      return files.stat(path.join(filepath, '.meteor', 'packages')).isFile();
    } catch (e) {
      return false;
    }
  };

  return findUpwards(isAppDir, filepath);
};

files.findPackageDir = function (filepath) {
  var isPackageDir = function (filepath) {
    try {
      return files.stat(path.join(filepath, 'package.js')).isFile();
    } catch (e) {
      return false;
    }
  };

  return findUpwards(isPackageDir, filepath);
};

// create a .gitignore file in dirPath if one doesn't exist. add
// 'entry' to the .gitignore on its own line at the bottom of the
// file, if the exact line does not already exist in the file.
files.addToGitignore = function (dirPath, entry) {
  var filepath = path.join(dirPath, ".gitignore");
  if (files.exists(filepath)) {
    var data = files.readFile(filepath, 'utf8');
    var lines = data.split(/\n/);
    if (_.any(lines, function (x) { return x === entry; })) {
      // already there do nothing
    } else {
      // rewrite file w/ new entry.
      if (data.substr(-1) !== "\n") data = data + "\n";
      data = data + entry + "\n";
      files.writeFile(filepath, data, 'utf8');
    }
  } else {
    // doesn't exist, just write it.
    files.writeFile(filepath, entry + "\n", 'utf8');
  }
};

// Are we running Meteor from a git checkout?
files.inCheckout = _.once(function () {
  try {
    // can't use files.exists here because not in a fiber
    if (fs.existsSync(path.join(files.getCurrentToolsDir(), '.git')))
      return true;
  } catch (e) { console.log(e); }

  return false;
});

// True if we are using a warehouse: either installed Meteor, or if
// $METEOR_WAREHOUSE_DIR is set. Otherwise false (we're in a git checkout and
// just using packages from the checkout).
files.usesWarehouse = function () {
  // Test hook: act like we're "installed" using a non-homedir warehouse
  // directory.
  if (process.env.METEOR_WAREHOUSE_DIR)
    return true;
  else
    return ! files.inCheckout();
};

// Read the '.tools_version.txt' file. If in a checkout, throw an error.
files.getToolsVersion = function () {
  if (! files.inCheckout()) {
    var isopackJsonPath = path.join(files.getCurrentToolsDir(),
      '..',  // get out of tool, back to package
      'isopack.json');

    var parsed;

    if (files.exists(isopackJsonPath)) {
      var isopackJson = files.readFile(isopackJsonPath);
      parsed = JSON.parse(isopackJson);

      // XXX "isopack-1" is duplicate of isopack.currentFormat
      parsed = parsed["isopack-1"]; // get the right format from the JSON
      return parsed.name + '@' + parsed.version;
    }

    // XXX COMPAT WITH 0.9.3
    var unipackageJsonPath = path.join(files.getCurrentToolsDir(),
      '..',  // get out of tool, back to package
      'unipackage.json');
    var unipackageJson = files.readFile(unipackageJsonPath);
    parsed = JSON.parse(unipackageJson);
    return parsed.name + '@' + parsed.version;

  } else {
    throw new Error("Unexpected. Git checkouts don't have tools versions.");
  }
};

// Return the root of dev_bundle (probably /usr/local/meteor in an
// install, or (checkout root)/dev_bundle in a checkout.).
files.getDevBundle = function () {
  return path.join(files.getCurrentToolsDir(), 'dev_bundle');
};

// Return the top-level directory for this meteor install or checkout
files.getCurrentToolsDir = function () {
  return path.join(__dirname, '..');
};

// Read a settings file and sanity-check it. Returns a string on
// success or null on failure (in which case buildmessages will be
// emitted).
files.getSettings = function (filename, watchSet) {
  buildmessage.assertInCapture();
  var absPath = path.resolve(filename);
  var buffer = watch.readAndWatchFile(watchSet, absPath);
  if (buffer === null) {
    buildmessage.error("file not found (settings file)",
                       { file: filename });
    return null;
  }

  if (buffer.length > 0x10000) {
    buildmessage.error("settings file is too large (must be less than 64k)",
                       { file: filename });
    return null;
  }

  var str = buffer.toString('utf8');

  // Ensure that the string is parseable in JSON, but there's no reason to use
  // the object value of it yet.
  if (str.match(/\S/)) {
    try {
      JSON.parse(str);
    } catch (e) {
      buildmessage.error("parse error reading settings file",
                         { file: filename });
    }
  }

  return str;
};

// Try to find the prettiest way to present a path to the
// user. Presently, the main thing it does is replace $HOME with ~.
files.prettyPath = function (p) {
  p = files.realpath(p);
  var home = process.env.HOME;
  if (! home)
    return p;
  var relativeToHome = path.relative(home, p);
  if (relativeToHome.substr(0, 3) === ('..' + path.sep))
    return p;
  return path.join('~', relativeToHome);
};

// Like statSync, but null if file not found
files.statOrNull = function (path) {
  try {
    return files.stat(path);
  } catch (e) {
    if (e.code == "ENOENT")
      return null;
    throw e;
  }
};


// Like rm -r.
files.rm_recursive = function (p) {
  try {
    // the l in lstat is critical -- we want to remove symbolic
    // links, not what they point to
    var stat = files.lstat(p);
  } catch (e) {
    if (e.code == "ENOENT")
      return;
    throw e;
  }

  if (stat.isDirectory()) {
    _.each(files.readdir(p), function (file) {
      file = path.join(p, file);
      files.rm_recursive(file);
    });
    files.rmdir(p);
  } else
    files.unlink(p);
};

// Makes all files in a tree read-only.
var makeTreeReadOnly = function (p) {
  try {
    // the l in lstat is critical -- we want to ignore symbolic links
    var stat = files.lstat(p);
  } catch (e) {
    if (e.code == "ENOENT")
      return;
    throw e;
  }

  if (stat.isDirectory()) {
    _.each(files.readdir(p), function (file) {
      makeTreeReadOnly(path.join(p, file));
    });
  }
  if (stat.isFile()) {
    var permissions = stat.mode & 0777;
    var readOnlyPermissions = permissions & 0555;
    if (permissions !== readOnlyPermissions)
      files.chmod(p, readOnlyPermissions);
  }
};

// Returns the base64 SHA256 of the given file.
files.fileHash = function (filename) {
  var crypto = require('crypto');
  var hash = crypto.createHash('sha256');
  hash.setEncoding('base64');
  var rs = files.createReadStream(filename);
  var fut = new Future();
  rs.on('end', function () {
    rs.close();
    fut.return(hash.digest('base64'));
  });
  rs.pipe(hash, { end: false });
  return fut.wait();
};


// Returns a base64 SHA256 hash representing a tree on disk. It is not sensitive
// to modtime, uid/gid, or any permissions bits other than the current-user-exec
// bit on normal files.
files.treeHash = function (root, options) {
  options = _.extend({
    ignore: function (relativePath) {
      return false;
    }
  }, options);

  var crypto = require('crypto');
  var hash = crypto.createHash('sha256');

  var hashLog = process.env.TREE_HASH_DEBUG ?
        ['\n\nTREE HASH for ' + root + '\n'] : null;

  var updateHash = function (text) {
    hashLog && hashLog.push(text);
    hash.update(text);
  };

  var traverse = function (relativePath) {
    if (options.ignore(relativePath)) {
      hashLog && hashLog.push('SKIP ' + JSON.stringify(relativePath) + '\n');
      return;
    }

    var absPath = path.join(root, relativePath);
    var stat = files.lstat(absPath);

    if (stat.isDirectory()) {
      if (relativePath) {
        updateHash('dir ' + JSON.stringify(relativePath) + '\n');
      }
      _.each(files.readdir(absPath), function (entry) {
        traverse(path.join(relativePath, entry));
      });
    } else if (stat.isFile()) {
      if (!relativePath) {
        throw Error("must call files.treeHash on a directory");
      }
      updateHash('file ' + JSON.stringify(relativePath) + ' ' +
                  stat.size + ' ' + files.fileHash(absPath) + '\n');
      if (stat.mode & 0100) {
        updateHash('exec\n');
      }
    } else if (stat.isSymbolicLink()) {
      if (!relativePath) {
        throw Error("must call files.treeHash on a directory");
      }
      updateHash('symlink ' + JSON.stringify(relativePath) + ' ' +
                 JSON.stringify(fs.readlinkSync(absPath)) + '\n');
    }
    // ignore anything weirder
  };

  traverse('');
  hashLog && files.appendFile(process.env.TREE_HASH_DEBUG, hashLog.join(''));
  return hash.digest('base64');
};

// like mkdir -p. if it returns true, the item is a directory (even if
// it was already created). if it returns false, the item is not a
// directory and we couldn't make it one.
files.mkdir_p = function (dir, mode) {
  var p = path.resolve(dir);
  var ps = path.normalize(p).split(path.sep);

  if (files.exists(p)) {
    if (files.stat(p).isDirectory()) { return true;}
    return false;
  }

  // doesn't exist. recurse to build parent.
  var success = files.mkdir_p(ps.slice(0,-1).join(path.sep), mode);
  // parent is not a directory.
  if (!success) { return false; }

  files.mkdir(p, mode);

  // double check we exist now
  if (!files.exists(p) ||
      !files.stat(p).isDirectory())
    return false; // wtf
  return true;
};

// Roughly like cp -R. 'from' should be a directory. 'to' can either
// be a directory, or it can not exist (in which case it will be
// created with mkdir_p).
//
// The output files will be readable and writable by everyone that the umask
// allows, and executable by everyone (modulo umask) if the original file was
// owner-executable. Symlinks are treated transparently (ie the contents behind
// them are copied, and it's an error if that points nowhere).
//
// If options.transform{Filename, Contents} is present, it should
// be a function, and the contents (as a buffer) or filename will be
// passed through the function. Use this to, eg, fill templates.
//
// If options.ignore is present, it should be a list of regexps. Any
// file whose basename matches one of the regexps, before
// transformation, will be skipped.
files.cp_r = function (from, to, options) {
  options = options || {};

  var absFrom = path.resolve(from);
  files.mkdir_p(to, 0755);

  _.each(files.readdir(from), function (f) {
    if (_.any(options.ignore || [], function (pattern) {
      return f.match(pattern);
    })) return;

    var fullFrom = path.join(from, f);
    if (options.transformFilename)
      f = options.transformFilename(f);
    var fullTo = path.join(to, f);
    var stats = options.preserveSymlinks
          ? files.lstat(fullFrom) : files.stat(fullFrom);
    if (stats.isDirectory()) {
      files.cp_r(fullFrom, fullTo, options);
    } else if (stats.isSymbolicLink()) {
      var linkText = fs.readlinkSync(fullFrom);
      fs.symlinkSync(linkText, fullTo);
    } else {
      var absFullFrom = path.resolve(fullFrom);

      // Create the file as readable and writable by everyone, and executable by
      // everyone if the original file is executably by owner. (This mode will
      // be modified by umask.) We don't copy the mode *directly* because this
      // function is used by 'meteor create' which is copying from the read-only
      // tools tree into a writable app.
      var mode = (stats.mode & 0100) ? 0777 : 0666;
      if (!options.transformContents) {
        copyFileHelper(fullFrom, fullTo, mode);
      } else {
        var contents = files.readFile(fullFrom);
        contents = options.transformContents(contents, f);
        files.writeFile(fullTo, contents, { mode: mode });
      }
    }
  });
};

// Copies a file, which is expected to exist. Parent directories of "to" do not
// have to exist. Treats symbolic links transparently (copies the contents, not
// the link itself, and it's an error if the link doesn't point to a file).
files.copyFile = function (from, to) {
  files.mkdir_p(path.dirname(path.resolve(to)), 0755);

  var stats = files.stat(from);
  if (!stats.isFile()) {
    throw Error("cannot copy non-files");
  }

  // Create the file as readable and writable by everyone, and executable by
  // everyone if the original file is executably by owner. (This mode will be
  // modified by umask.) We don't copy the mode *directly* because this function
  // is used by 'meteor create' which is copying from the read-only tools tree
  // into a writable app.
  var mode = (stats.mode & 0100) ? 0777 : 0666;

  copyFileHelper(from, to, mode);
};

var copyFileHelper = function (from, to, mode) {
  var readStream = files.createReadStream(from);
  var writeStream = files.createWriteStream(to, { mode: mode });
  var future = new Future;
  var onError = function (e) {
    future.isResolved() || future.throw(e);
  };
  readStream.on('error', onError);
  writeStream.on('error', onError);
  writeStream.on('open', function () {
    readStream.pipe(writeStream);
  });
  writeStream.once('finish', function () {
    future.isResolved() || future.return();
  });
  future.wait();
};

// Make a temporary directory. Returns the path to the newly created
// directory. Only the current user is allowed to read or write the
// files in the directory (or add files to it). The directory will
// be cleaned up on exit.
var tempDirs = [];
files.mkdtemp = function (prefix) {
  var make = function () {
    prefix = prefix || 'meteor-temp-';
    // find /tmp
    var tmpDir = _.first(_.map(['TMPDIR', 'TMP', 'TEMP'], function (t) {
      return process.env[t];
    }).filter(_.identity)) || path.sep + 'tmp';
    tmpDir = files.realpath(tmpDir);

    // make the directory. give it 3 tries in case of collisions from
    // crappy random.
    var tries = 3;
    while (tries > 0) {
      var dirPath = path.join(
        tmpDir, prefix + (Math.random() * 0x100000000 + 1).toString(36));
      try {
        files.mkdir(dirPath, 0700);
        return dirPath;
      } catch (err) {
        tries--;
      }
    }
    throw new Error("failed to make temporary directory in " + tmpDir);
  };
  var dir = make();
  tempDirs.push(dir);
  return dir;
};

// Cleans out the temporary directory if METEOR_SAVE_TMPDIRS is not set
// May want to restrict this to the current user, now that it can be
// executed at any point, rather than just on exit.
files.cleanTemp = function () {
  if (!process.env.METEOR_SAVE_TMPDIRS) {
    _.each(tempDirs, files.rm_recursive);
    tempDirs = [];
  }
}

cleanup.onExit(function (sig) {
  files.cleanTemp();
});

// Takes a buffer containing `.tar.gz` data and extracts the archive
// into a destination directory. destPath should not exist yet, and
// the archive should contain a single top-level directory, which will
// be renamed atomically to destPath. The entire tree will be made
// readonly.
files.extractTarGz = function (buffer, destPath) {
  var parentDir = path.dirname(destPath);
  var tempDir = path.join(parentDir, '.tmp' + utils.randomToken());
  files.mkdir_p(tempDir);

  var future = new Future;

  var tar = require("tar");
  var zlib = require("zlib");
  var gunzip = zlib.createGunzip()
    .on('error', function (e) {
      future.isResolved() || future.throw(e);
    });
  var extractor = new tar.Extract({ path: tempDir })
    .on('error', function (e) {
      future.isResolved() || future.throw(e);
    })
    .on('end', function () {
      future.isResolved() || future.return();
    });

  // write the buffer to the (gunzip|untar) pipeline; these calls
  // cause the tar to be extracted to disk.
  gunzip.pipe(extractor);
  gunzip.write(buffer);
  gunzip.end();
  future.wait();

  // succeed!
  var topLevelOfArchive = files.readdir(tempDir);
  if (topLevelOfArchive.length !== 1)
    throw new Error(
      "Extracted archive '" + tempDir + "' should only contain one entry");

  var extractDir = path.join(tempDir, topLevelOfArchive[0]);
  makeTreeReadOnly(extractDir);
  files.rename(extractDir, destPath);
  files.rmdir(tempDir);
};

// Tar-gzips a directory, returning a stream that can then be piped as
// needed.  The tar archive will contain a top-level directory named
// after dirPath.
files.createTarGzStream = function (dirPath, options) {
  var tar = require("tar");
  var fstream = require('fstream');
  var zlib = require("zlib");

  // Use `dirPath` as the argument to `fstream.Reader` here instead of
  // `{ path: dirPath, type: 'Directory' }`. This is a workaround for a
  // collection of odd behaviors in fstream (which might be bugs or
  // might just be weirdnesses). First, if we pass an object with `type:
  // 'Directory'` as an argument, then the resulting tarball has no
  // entry for the top-level directory, because the reader emits an
  // entry (with just the path, no permissions or other properties)
  // before the pipe to gzip is even set up, so that entry gets
  // lost. Even if we pause the streams until all the pipes are set up,
  // we'll get the entry in the tarball for the top-level directory
  // without permissions or other properties, which is problematic. Just
  // passing `dirPath` appears to cause `fstream` to stat the directory
  // before emitting an entry for it, so the pipes are set up by the
  // time the entry is emitted, and the entry has all the right
  // permissions, etc. from statting it.
  //
  // The second weird behavior is that we need an entry for the
  // top-level directory in the tarball to untar it with npm `tar`. (GNU
  // tar, in contrast, appears to have no problems untarring tarballs
  // without entries for the top-level directory inside them.) The
  // problem is that, without an entry for the top-level directory,
  // `fstream` will create the directory with the same permissions as
  // the first file inside it. This manifests as an EACCESS when
  // untarring if the first file inside the top-level directory is not
  // writeable.
  return fstream.Reader(dirPath).pipe(
    tar.Pack({ noProprietary: true })).pipe(zlib.createGzip());
};

// Tar-gzips a directory into a tarball on disk, synchronously.
// The tar archive will contain a top-level directory named after dirPath.
files.createTarball = function (dirPath, tarball, options) {
  var future = new Future;
  var out = files.createWriteStream(tarball);
  out.on('error', function (err) {
    future.throw(err);
  });
  out.on('close', function () {
    future.return();
  });

  files.createTarGzStream(dirPath, options).pipe(out);
  future.wait();
};

// Use this if you'd like to replace a directory with another
// directory as close to atomically as possible. It's better than
// recursively deleting the target directory first and then
// renaming. (Failure modes here include "there's a brief moment where
// toDir does not exist" and "you can end up with garbage directories
// sitting around", but not "there's any time where toDir exists but
// is in a state other than initial or final".)
files.renameDirAlmostAtomically = function (fromDir, toDir) {
  var garbageDir = toDir + '-garbage-' + utils.randomToken();

  // Get old dir out of the way, if it exists.
  var movedOldDir = true;
  try {
    files.rename(toDir, garbageDir);
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw e;
    movedOldDir = false;
  }

  // Now rename the directory.
  files.rename(fromDir, toDir);

  // ... and delete the old one.
  if (movedOldDir)
    files.rm_recursive(garbageDir);
};

files.writeFileAtomically = function (filename, contents) {
  var tmpFile = path.join(
    path.dirname(filename),
    '.' + path.basename(filename) + '.' + utils.randomToken());
  files.writeFile(tmpFile, contents);
  files.rename(tmpFile, filename);
};

// Like fs.symlinkSync, but creates a temporay link and renames it over the
// file; this means it works even if the file already exists.
files.symlinkOverSync = function (linkText, file) {
  file = path.resolve(file);
  var tmpSymlink = path.join(
    path.dirname(file),
    "." + path.basename(file) + ".tmp" + utils.randomToken());
  fs.symlinkSync(linkText, tmpSymlink);
  files.rename(tmpSymlink, file);
};

// Run a program synchronously and, assuming it returns success (0),
// return whatever it wrote to stdout, as a string. Otherwise (if it
// did not exit gracefully and return 0) return null. As node has
// chosen not to provide a synchronous binding of wait(2), this
// function must be called from inside a fiber.
//
// `command` is the command to run. (We use node's
// child_process.execFile, which appears to take the liberty of
// searching your path using some mechanism.) Any additional arguments
// should be strings and will be passed as arguments to `command`. It
// is not necessary to pass `command` twice to set argv[0] as it is
// with the traditional POSIX execl(2).
//
// XXX 'files' is not the ideal place for this but it'll do for now
files.run = function (command /*, arguments */) {
  var Future = require('fibers/future');
  var future = new Future;
  var args = _.toArray(arguments).slice(1);

  var child_process = require("child_process");
  child_process.execFile(
    command, args, {}, function (error, stdout, stderr) {
      if (! (error === null || error.code === 0)) {
        future.return(null);
      } else {
        future.return(stdout);
      }
    });
  return future.wait();
};

files.runGitInCheckout = function (/* arguments */) {
  var args = _.toArray(arguments);
  args.unshift('git',
               '--git-dir=' + path.join(files.getCurrentToolsDir(), '.git'));
  var ret = files.run.apply(files, args);
  if (ret === null) {
    // XXX files.run really ought to give us some actual context
    throw new Error("error running git " + args[2]);
  }
  return ret;
};

// Return the result of evaluating `code` using
// `runInThisContext`. `code` will be wrapped in a closure. You can
// pass additional values to bind in the closure in `options.symbols`,
// the keys being the symbols to bind and the values being their
// values. `options.filename` is the filename to use in exceptions
// that come from inside this code. `options.sourceMap` is an optional
// source map that represents the file.
//
// The really special thing about this function is that if a parse
// error occurs, we will raise an exception of type
// files.FancySyntaxError, from which you may read 'message', 'file',
// 'line', and 'column' attributes ... v8 is normally reluctant to
// reveal this information but will write it to stderr if you pass it
// an undocumented flag. Unforunately though node doesn't have dup2 so
// we can't intercept the write. So instead we use a completely
// different parser with a better error handling API. Ah well.  The
// underlying V8 issue is:
//   https://code.google.com/p/v8/issues/detail?id=1281
files.runJavaScript = function (code, options) {
  if (typeof code !== 'string')
    throw new Error("code must be a string");

  options = options || {};
  var filename = options.filename || "<anonymous>";
  var keys = [], values = [];
  // don't assume that _.keys and _.values are guaranteed to
  // enumerate in the same order
  _.each(options.symbols, function (value, name) {
    keys.push(name);
    values.push(value);
  });

  var stackFilename = filename;
  if (options.sourceMap) {
    // We want to generate an arbitrary filename that we use to associate the
    // file with its source map.
    stackFilename = "<runJavaScript-" + nextStackFilenameCounter++ + ">";
  }

  var chunks = [];
  var header = "(function(" + keys.join(',') + "){";
  chunks.push(header);
  if (options.sourceMap) {
    var consumer = new sourcemap.SourceMapConsumer(options.sourceMap);
    chunks.push(sourcemap.SourceNode.fromStringWithSourceMap(
      code, consumer));
  } else {
    chunks.push(code);
  }
  // \n is necessary in case final line is a //-comment
  chunks.push("\n})");

  var wrapped;
  var parsedSourceMap = null;
  if (options.sourceMap) {
    var node = new sourcemap.SourceNode(null, null, null, chunks);
    var results = node.toStringWithSourceMap({
      file: stackFilename
    });
    wrapped = results.code;
    parsedSourceMap = results.map.toJSON();
    if (options.sourceMapRoot) {
      // Add the specified root to any root that may be in the file.
      parsedSourceMap.sourceRoot = path.join(
        options.sourceMapRoot, parsedSourceMap.sourceRoot || '');
    }
    // source-map-support doesn't ever look at the sourcesContent field, so
    // there's no point in keeping it in memory.
    delete parsedSourceMap.sourcesContent;
    parsedSourceMaps[stackFilename] = parsedSourceMap;
  } else {
    wrapped = chunks.join('');
  };

  try {
    // See #runInThisContext
    //
    // XXX it'd be nice to runInNewContext so that the code can't mess
    // with our globals, but objects that come out of runInNewContext
    // have bizarro antimatter prototype chains and break 'instanceof
    // Array'. for now, steer clear
    //
    // Pass 'true' as third argument if we want the parse error on
    // stderr (which we don't).
    var script = require('vm').createScript(wrapped, stackFilename);
  } catch (nodeParseError) {
    if (!(nodeParseError instanceof SyntaxError))
      throw nodeParseError;
    // Got a parse error. Unfortunately, we can't actually get the
    // location of the parse error from the SyntaxError; Node has some
    // hacky support for displaying it over stderr if you pass an
    // undocumented third argument to stackFilename, but that's not
    // what we want. See
    //    https://github.com/joyent/node/issues/3452
    // for more information. One thing to try (and in fact, what an
    // early version of this function did) is to actually fork a new
    // node to run the code and parse its output. We instead run an
    // entirely different JS parser, from the esprima project, but
    // which at least has a nice API for reporting errors.
    var esprima = require('esprima');
    try {
      esprima.parse(wrapped);
    } catch (esprimaParseError) {
      // Is this actually an Esprima syntax error?
      if (!('index' in esprimaParseError &&
            'lineNumber' in esprimaParseError &&
            'column' in esprimaParseError &&
            'description' in esprimaParseError)) {
        throw esprimaParseError;
      }
      var err = new files.FancySyntaxError;

      err.message = esprimaParseError.description;

      if (parsedSourceMap) {
        // XXX this duplicates code in computeGlobalReferences
        var consumer2 = new sourcemap.SourceMapConsumer(parsedSourceMap);
        var original = consumer2.originalPositionFor({
          line: esprimaParseError.lineNumber,
          column: esprimaParseError.column - 1
        });
        if (original.source) {
          err.file = original.source;
          err.line = original.line;
          err.column = original.column + 1;
          throw err;
        }
      }

      err.file = filename;  // *not* stackFilename
      err.line = esprimaParseError.lineNumber;
      err.column = esprimaParseError.column;
      // adjust errors on line 1 to account for our header
      if (err.line === 1) {
        err.column -= header.length;
      }
      throw err;
    }

    // What? Node thought that this was a parse error and esprima didn't? Eh,
    // just throw Node's error and don't care too much about the line numbers
    // being right.
    throw nodeParseError;
  }

  var func = script.runInThisContext();

  return (buildmessage.markBoundary(func)).apply(null, values);
};

// - message: an error message from the parser
// - file: filename
// - line: 1-based
// - column: 1-based
files.FancySyntaxError = function () {};

files.OfflineError = function (error) {
  this.error = error;
};
files.OfflineError.prototype.toString = function () {
  return "[Offline: " + this.error.toString() + "]";
};

// Like files.readdir, but skips entries whose names begin with dots, and
// converts ENOENT to [].
files.readdirNoDots = function (path) {
  try {
    var entries = files.readdir(path);
  } catch (e) {
    if (e.code === 'ENOENT')
      return [];
    throw e;
  }
  return _.filter(entries, function (entry) {
    return entry && entry[0] !== '.';
  });
};

// Read a file in line by line. Returns an array of lines to be
// processed individually. Throws if the file doesn't exist or if
// anything else goes wrong.
var getLines = function (file) {
  var buffer = files.readFile(file);
  var lines = exports.splitBufferToLines(buffer);

  // strip blank lines at the end
  while (lines.length) {
    var line = lines[lines.length - 1];
    if (line.match(/\S/))
      break;
    lines.pop();
  }

  return lines;
};

exports.getLines = getLines;

exports.splitBufferToLines = function (buffer) {
  return buffer.toString('utf8').split(/\r*\n\r*/);
};

// Same as `getLines`, but returns [] if the file doesn't exist.
exports.getLinesOrEmpty = function (file) {
  try {
    return getLines(file);
  } catch (e) {
    if (e && e.code === 'ENOENT')
      return [];
    throw e;
  }
};

// Returns null if the file does not exist, otherwise returns the parsed JSON in
// the file. Throws on errors other than ENOENT (including JSON parse failure).
exports.readJSONOrNull = function (file) {
  try {
    var raw = files.readFile(file, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT')
      return null;
    throw e;
  }
  return JSON.parse(raw);
};

// Trims whitespace & other filler characters of a line in a project file.
files.trimSpaceAndComments = function (line) {
  var match = line.match(/^([^#]*)#/);
  if (match)
    line = match[1];
  return files.trimSpace(line);
};

// Trims leading and trailing whilespace in a project file.
files.trimSpace = function (line) {
  return line.replace(/^\s+|\s+$/g, '');
};


files.KeyValueFile = function (path) {
  var self = this;
  self.path = path;
}

_.extend(files.KeyValueFile.prototype, {
  set: function (k, v) {
    var self = this;

    var data = self._readAll() || '';
    var lines = data.split(/\n/);

    var found = false;
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (trimmed.indexOf(k + '=') == 0) {
        lines[i] = k + '=' + v;
        found = true;
      }
    }
    if (!found) {
      lines.push(k + "=" + v);
    }
    var newdata = lines.join('\n') + '\n';
    files.writeFile(self.path, newdata, 'utf8');
  },

  _readAll: function () {
    var self = this;

    if (files.exists(self.path)) {
      return files.readFile(self.path, 'utf8');
    } else {
      return null;
    }
  }
});

/////// Below here are wrappers of fs.* and path.* functions

var toPosixPath = function (p) {
  p = p.replace(/\\/g, '/');
  if (p[1] === ':') {
    // transform "C:/bla/bla" to "/C/bla/bla"
    p = '/' + p[0] + p.slice(2);
  }

  return p;
};

var toDosPath = function (p) {
  if (p[0] === '/') {
    if (! /^\/[A-Z]\//.test(p))
      throw new Error("Surprising path: " + p);
    // transform a previously windows path back
    // "/C/something" to "C:/something"
    p = p[1] + ":" + p.slice(2);
  }

  p = p.replace(/\//g, '\\');
  return p;
};

var convertToOSPath = function (standardPath) {
  if (process.platform === "win32") {
    return toDosPath(standardPath);
  }

  return standardPath;
};

var convertToStandardPath = function (osPath) {
  if (process.platform === "win32") {
    return toPosixPath(osPath);
  }

  return osPath;
}

/**
 * Wrap a function from node's fs module to use the right slashes for this OS
 * and run in a fiber, then assign it to the "files" namespace. Each call
 * creates two versions: a files.func that runs asynchronously with Fibers,
 * and a files.funcSync that runs synchronously and doesn't yield.
 * @param  {String} fsFuncName         The name of the node fs function to wrap
 * @param  {Number[]} pathArgIndices Indices of arguments that have paths, these
 * arguments will be converted to the correct OS slashes
 * @param  {Object} options        Some options for lesser-used cases
 * @param {Boolean} options.noErr If true, the callback of the wrapped function
 * doesn't have a first "error" argument, for example in fs.exists.
 * @param {Function} options.modifyReturnValue Pass in a function to modify the
 * return value
 */
function wrapFsFunc(fsFuncName, pathArgIndices, options) {
  options = options || {};

  var fsFunc = fs[fsFuncName];
  var fsFuncSync = fs[fsFuncName + "Sync"];

  function wrapper() {
    var argc = arguments.length;
    var args = new Array(argc);
    for (var i = 0; i < argc; ++i) {
      args[i] = arguments[i];
    }

    for (var j = pathArgIndices.length - 1; j >= 0; --j) {
      i = pathArgIndices[j];
      args[i] = convertToOSPath(args[i]);
    }

    if (Fiber.current &&
        Fiber.yield && ! Fiber.yield.disallowed) {
      var fut = new Future;

      args.push(function callback(err, value) {
        if (options.noErr) {
          fut.return(err);
        } else if (err) {
          fut.throw(err);
        } else {
          fut.return(value);
        }
      });

      fsFunc.apply(fs, args);

      var result = fut.wait();
      return options.modifyReturnValue
        ? options.modifyReturnValue(result)
        : result;
    }

    // If we're not in a Fiber, run the sync version of the fs.* method.
    var result = fsFuncSync.apply(fs, args);
    return options.modifyReturnValue
      ? options.modifyReturnValue(result)
      : result;
  }

  wrapper.displayName = fsFuncName;
  return files[fsFuncName] = wrapper;
}

wrapFsFunc("writeFile", [0]);
wrapFsFunc("appendFile", [0]);
wrapFsFunc("readFile", [0]);
wrapFsFunc("stat", [0]);
wrapFsFunc("lstat", [0]);
wrapFsFunc("exists", [0], {noErr: true});
wrapFsFunc("rename", [0, 1]);

// Warning: doesn't convert slashes in the second 'cache' arg
wrapFsFunc("realpath", [0], {
  modifyReturnValue: convertToStandardPath
});

wrapFsFunc("readdir", [0], {
  modifyReturnValue: function (files) {
    return _.map(files, convertToStandardPath);
  }
});

wrapFsFunc("rmdir", [0]);
wrapFsFunc("mkdir", [0]);
wrapFsFunc("unlink", [0]);
wrapFsFunc("chmod", [0]);
wrapFsFunc("open", [0]);

// XXX this doesn't give you the second argument to the callback
wrapFsFunc("read", []);
wrapFsFunc("write", []);
wrapFsFunc("close", []);
wrapFsFunc("symlink", [0, 1]);
wrapFsFunc("readlink", [0]);

files.createReadStream = function () {
  var args = _.toArray(arguments);
  args[0] = convertToOSPath(args[0]);
  return fs.createReadStream.apply(fs, args);
};

files.createWriteStream = function () {
  var args = _.toArray(arguments);
  args[0] = convertToOSPath(args[0]);
  return fs.createWriteStream.apply(fs, args);
};

files.watchFile = function () {
  var args = _.toArray(arguments);
  args[0] = convertToOSPath(args[0]);
  return fs.watchFile.apply(fs, args);
};

files.unwatchFile = function () {
  var args = _.toArray(arguments);
  args[0] = convertToOSPath(args[0]);
  return fs.unwatchFile.apply(fs, args);
};

// wrappings for path functions that always run as they were on unix (using
// forward slashes)
var wrapPathFunction = function (name) {
  var f = path[name];

  return function (/* args */) {
    if (process.platform === 'win32') {
      var args = _.toArray(arguments);
      return toPosixPath(f.apply(path, _.map(args, toDosPath)));
    } else {
      return f.apply(path, arguments);
    }
  };
};

files.pathJoin = wrapPathFunction("join");
files.pathNormalize = wrapPathFunction("normalize");
files.pathRelative = wrapPathFunction("relative");
files.pathResolve = wrapPathFunction("resolve");
files.pathDirname = wrapPathFunction("dirname");
files.pathBasename = wrapPathFunction("basename");
files.pathExtname = wrapPathFunction("extname");
files.pathSep = '/';
files.pathDelimiter = ':';

// wrap pathwatcher because it works with file system paths
files.pathwatcherWatch = function () {
  var args = _.toArray(arguments);
  args[0] = convertToOSPath(args[0]);
  // don't import pathwatcher until the moment we actually need it
  // pathwatcher has a record of keeping some global state
  var pathwatcher = require('pathwatcher');
  return pathwatcher.watch.apply(pathwatcher, args);
};

