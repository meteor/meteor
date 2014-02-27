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
    // change to: `return fs.existsSync(path.join(filepath, '.meteor',
    // 'release'))`

    // .meteor/packages can be a directory, if .meteor is a warehouse
    // directory.  since installing meteor initializes a warehouse at
    // $HOME/.meteor, we want to make sure your home directory (and all
    // subdirectories therein) don't count as being within a meteor app.
    try { // use try/catch to avoid the additional syscall to fs.existsSync
      return fs.statSync(path.join(filepath, '.meteor', 'packages')).isFile();
    } catch (e) {
      return false;
    }
  };

  return findUpwards(isAppDir, filepath);
};

// create a .gitignore file in dirPath if one doesn't exist. add
// 'entry' to the .gitignore on its own line at the bottom of the
// file, if the exact line does not already exist in the file.
files.addToGitignore = function (dirPath, entry) {
  var filepath = path.join(dirPath, ".gitignore");
  if (fs.existsSync(filepath)) {
    var data = fs.readFileSync(filepath, 'utf8');
    var lines = data.split(/\n/);
    if (_.any(lines, function (x) { return x === entry; })) {
      // already there do nothing
    } else {
      // rewrite file w/ new entry.
      if (data.substr(-1) !== "\n") data = data + "\n";
      data = data + entry + "\n";
      fs.writeFileSync(filepath, data, 'utf8');
    }
  } else {
    // doesn't exist, just write it.
    fs.writeFileSync(filepath, entry + "\n", 'utf8');
  }
};

// Are we running Meteor from a git checkout?
files.inCheckout = function () {
  try {
    if (fs.existsSync(path.join(files.getCurrentToolsDir(), '.git')))
      return true;
  } catch (e) { console.log(e); }

  return false;
};

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
    return fs.readFileSync(
      path.join(files.getCurrentToolsDir(), '.tools_version.txt'), 'utf8');
  } else {
    throw new Error("Unexpected. Git checkouts don't have tools versions.");
  }
};

// Return the root of dev_bundle (probably /usr/local/meteor in an
// install, or (checkout root)/dev_bundle in a checkout.).
files.getDevBundle = function () {
  if (files.inCheckout())
    return path.join(files.getCurrentToolsDir(), 'dev_bundle');
  else
    return files.getCurrentToolsDir();
};

// Return the top-level directory for this meteor install or checkout
files.getCurrentToolsDir = function () {
  return path.join(__dirname, '..');
};

// Read a settings file and sanity-check it. Returns a string on
// success or null on failure (in which case buildmessages will be
// emitted).
files.getSettings = function (filename, watchSet) {
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
files.prettyPath = function (path) {
  path = fs.realpathSync(path);
  var home = process.env.HOME;
  if (home && path.substr(0, home.length) === home)
    path = "~" + path.substr(home.length);
  return path;
};

// Like rm -r.
files.rm_recursive = function (p) {
  try {
    // the l in lstat is critical -- we want to remove symbolic
    // links, not what they point to
    var stat = fs.lstatSync(p);
  } catch (e) {
    if (e.code == "ENOENT")
      return;
    throw e;
  }

  if (stat.isDirectory()) {
    _.each(fs.readdirSync(p), function (file) {
      file = path.join(p, file);
      files.rm_recursive(file);
    });
    fs.rmdirSync(p);
  } else
    fs.unlinkSync(p);
};

// Makes all files in a tree read-only.
var makeTreeReadOnly = function (p) {
  try {
    // the l in lstat is critical -- we want to ignore symbolic links
    var stat = fs.lstatSync(p);
  } catch (e) {
    if (e.code == "ENOENT")
      return;
    throw e;
  }

  if (stat.isDirectory()) {
    _.each(fs.readdirSync(p), function (file) {
      makeTreeReadOnly(path.join(p, file));
    });
  }
  if (stat.isFile()) {
    var permissions = stat.mode & 0777;
    var readOnlyPermissions = permissions & 0555;
    if (permissions !== readOnlyPermissions)
      fs.chmodSync(p, readOnlyPermissions);
  }
};

// like mkdir -p. if it returns true, the item is a directory (even if
// it was already created). if it returns false, the item is not a
// directory and we couldn't make it one.
files.mkdir_p = function (dir, mode) {
  var p = path.resolve(dir);
  var ps = path.normalize(p).split(path.sep);

  if (fs.existsSync(p)) {
    if (fs.statSync(p).isDirectory()) { return true;}
    return false;
  }

  // doesn't exist. recurse to build parent.
  var success = files.mkdir_p(ps.slice(0,-1).join(path.sep), mode);
  // parent is not a directory.
  if (!success) { return false; }

  fs.mkdirSync(p, mode);

  // double check we exist now
  if (!fs.existsSync(p) ||
      !fs.statSync(p).isDirectory())
    return false; // wtf
  return true;
};

// Roughly like cp -R. 'from' should be a directory. 'to' can either
// be a directory, or it can not exist (in which case it will be
// created with mkdir_p). Doesn't think about file mode at all.
//
// If options.transform{Filename, Contents} is present, it should
// be a function, and the contents (as a buffer) or filename will be
// passed through the function. Use this to, eg, fill templates.
//
// If options.ignore is present, it should be a list of regexps. Any
// file whose basename matches one of the regexps, before
// transformation, will be skipped.
//
// Returns the list of relative file paths copied to the destination,
// as filtered by ignore and transformed by transformFilename.
files.cp_r = function (from, to, options) {
  options = options || {};
  files.mkdir_p(to, 0755);
  var copied = [];
  _.each(fs.readdirSync(from), function (f) {
    if (_.any(options.ignore || [], function (pattern) {
      return f.match(pattern);
    })) return;

    var fullFrom = path.join(from, f);
    if (options.transformFilename)
      f = options.transformFilename(f);
    var fullTo = path.join(to, f);
    if (fs.statSync(fullFrom).isDirectory()) {
      var subdirPaths = files.cp_r(fullFrom, fullTo, options);
      copied = copied.concat(_.map(subdirPaths, function (subpath) {
        return path.join(f, subpath);
      }));
    }
    else {
      if (!options.transformContents) {
        // XXX reads full file into memory.. lame.
        fs.writeFileSync(fullTo, fs.readFileSync(fullFrom));
      } else {
        var contents = fs.readFileSync(fullFrom);
        contents = options.transformContents(contents, f);
        fs.writeFileSync(fullTo, contents);
      }
      copied.push(f);
    }
  });
  return copied;
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
    tmpDir = fs.realpathSync(tmpDir);

    // make the directory. give it 3 tries in case of collisions from
    // crappy random.
    var tries = 3;
    while (tries > 0) {
      var dirPath = path.join(
        tmpDir, prefix + (Math.random() * 0x100000000 + 1).toString(36));
      try {
        fs.mkdirSync(dirPath, 0700);
        return dirPath;
      } catch (err) {
        tries--;
      }
    }
    throw new Error("failed to make tempory directory in " + tmpDir);
  };
  var dir = make();
  tempDirs.push(dir);
  return dir;
};

cleanup.onExit(function (sig) {
  _.each(tempDirs, files.rm_recursive);
  tempDirs = [];
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
      future.throw(e);
    });
  var extractor = new tar.Extract({ path: tempDir })
    .on('error', function (e) {
      future.throw(e);
    })
    .on('end', function () {
      future.return();
    });

  // write the buffer to the (gunzip|untar) pipeline; these calls
  // cause the tar to be extracted to disk.
  gunzip.pipe(extractor);
  gunzip.write(buffer);
  gunzip.end();
  future.wait();

  // succeed!
  var topLevelOfArchive = fs.readdirSync(tempDir);
  if (topLevelOfArchive.length !== 1)
    throw new Error(
      "Extracted archive '" + tempDir + "' should only contain one entry");

  var extractDir = path.join(tempDir, topLevelOfArchive[0]);
  makeTreeReadOnly(extractDir);
  fs.renameSync(extractDir, destPath);
  fs.rmdirSync(tempDir);
};

// Tar-gzips a directory, returning a stream that can then be piped as
// needed.  The tar archive will contain a top-level directory named
// after dirPath.
files.createTarGzStream = function (dirPath) {
  var tar = require("tar");
  var fstream = require('fstream');
  var zlib = require("zlib");
  return fstream.Reader({ path: dirPath, type: 'Directory' }).pipe(
    tar.Pack()).pipe(zlib.createGzip());
};

// Tar-gzips a directory into a tarball on disk, synchronously.
// The tar archive will contain a top-level directory named after dirPath.
files.createTarball = function (dirPath, tarball) {
  var future = new Future;
  var out = fs.createWriteStream(tarball);
  out.on('error', function (err) {
    future.throw(err);
  });
  out.on('close', function () {
    future.return();
  });

  files.createTarGzStream(dirPath).pipe(out);
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
    fs.renameSync(toDir, garbageDir);
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw e;
    movedOldDir = false;
  }

  // Now rename the directory.
  fs.renameSync(fromDir, toDir);

  // ... and delete the old one.
  if (movedOldDir)
    files.rm_recursive(garbageDir);
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
