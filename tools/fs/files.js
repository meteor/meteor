///
/// utility functions for files and directories. includes both generic
/// helper functions (such as rm_recursive), and meteor-specific ones
/// (such as testing whether an directory is a meteor app)
///

var assert = require("assert");
var fs = require("fs");
var path = require('path');
var os = require('os');
var util = require('util');
var _ = require('underscore');
var Fiber = require('fibers');
var crypto = require('crypto');
var spawn = require("child_process").spawn;

var rimraf = require('rimraf');
var sourcemap = require('source-map');
var sourceMapRetrieverStack = require('../tool-env/source-map-retriever-stack.js');

var utils = require('../utils/utils.js');
var cleanup = require('../tool-env/cleanup.js');
var buildmessage = require('../utils/buildmessage.js');
var fiberHelpers = require('../utils/fiber-helpers.js');
var colonConverter = require('../utils/colon-converter.js');

var miniFiles = require('./mini-files.js');

var Profile = require('../tool-env/profile.js').Profile;

// Attach all exports of miniFiles here to avoid code duplication
var files = exports;
_.extend(files, miniFiles);

var parsedSourceMaps = {};
var nextStackFilenameCounter = 1;

// Use the source maps specified to runJavaScript
var useParsedSourceMap = function (pathForSourceMap) {
  // Check our fancy source map data structure, used for isopacks
  if (_.has(parsedSourceMaps, pathForSourceMap)) {
    return {map: parsedSourceMaps[pathForSourceMap]};
  }

  return null;
};

// Try this source map first
sourceMapRetrieverStack.push(useParsedSourceMap);

// Fibers are disabled by default for files.* operations unless
// process.env.METEOR_DISABLE_FS_FIBERS parses to a falsy value.
const YIELD_ALLOWED = !! (
  _.has(process.env, "METEOR_DISABLE_FS_FIBERS") &&
  ! JSON.parse(process.env.METEOR_DISABLE_FS_FIBERS));

function canYield() {
  return Fiber.current &&
    Fiber.yield &&
    ! Fiber.yield.disallowed;
}

function mayYield() {
  return YIELD_ALLOWED && canYield();
}

// given a predicate function and a starting path, traverse upwards
// from the path until we find a path that satisfies the predicate.
//
// returns either the path to the lowest level directory that passed
// the test or null for none found. if starting path isn't given, use
// cwd.
var findUpwards = function (predicate, startPath) {
  var testDir = startPath || files.cwd();
  while (testDir) {
    if (predicate(testDir)) {
      break;
    }
    var newDir = files.pathDirname(testDir);
    if (newDir === testDir) {
      testDir = null;
    } else {
      testDir = newDir;
    }
  }
  if (!testDir) {
    return null;
  }

  return testDir;
};

files.cwd = function () {
  return files.convertToStandardPath(process.cwd());
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
      return files.stat(
        files.pathJoin(filepath, '.meteor', 'packages')).isFile();
    } catch (e) {
      return false;
    }
  };

  return findUpwards(isAppDir, filepath);
};

files.findPackageDir = function (filepath) {
  var isPackageDir = function (filepath) {
    try {
      return files.stat(files.pathJoin(filepath, 'package.js')).isFile();
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
  var filepath = files.pathJoin(dirPath, ".gitignore");
  if (files.exists(filepath)) {
    var data = files.readFile(filepath, 'utf8');
    var lines = data.split(/\n/);
    if (_.any(lines, function (x) { return x === entry; })) {
      // already there do nothing
    } else {
      // rewrite file w/ new entry.
      if (data.substr(-1) !== "\n") {
        data = data + "\n";
      }
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
    if (files.exists(files.pathJoin(files.getCurrentToolsDir(), '.git'))) {
      return true;
    }
  } catch (e) { console.log(e); }

  return false;
});

// True if we are using a warehouse: either installed Meteor, or if
// $METEOR_WAREHOUSE_DIR is set. Otherwise false (we're in a git checkout and
// just using packages from the checkout).
files.usesWarehouse = function () {
  // Test hook: act like we're "installed" using a non-homedir warehouse
  // directory.
  if (process.env.METEOR_WAREHOUSE_DIR) {
    return true;
  } else {
    return ! files.inCheckout();
  }
};

// Read the '.tools_version.txt' file. If in a checkout, throw an error.
files.getToolsVersion = function () {
  if (! files.inCheckout()) {
    var isopackJsonPath = files.pathJoin(files.getCurrentToolsDir(),
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
    var unipackageJsonPath = files.pathJoin(files.getCurrentToolsDir(),
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
  return files.pathJoin(files.getCurrentToolsDir(), 'dev_bundle');
};

files.getCurrentNodeBinDir = function () {
  return files.pathJoin(files.getDevBundle(), "bin");
}

// Return the top-level directory for this meteor install or checkout
files.getCurrentToolsDir = function () {
  return files.pathDirname(
    files.pathDirname(
      files.convertToStandardPath(__dirname)));
};

// Read a settings file and sanity-check it. Returns a string on
// success or null on failure (in which case buildmessages will be
// emitted).
files.getSettings = function (filename, watchSet) {
  buildmessage.assertInCapture();
  var absPath = files.pathResolve(filename);
  var buffer = require("./watch.js").readAndWatchFile(watchSet, absPath);
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

  // The use of a byte order mark crashes JSON parsing. Since a BOM is not
  // required (or recommended) when using UTF-8, let's remove it if it exists.
  str = str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str;

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
  var home = files.getHomeDir();
  if (! home) {
    return p;
  }
  var relativeToHome = files.pathRelative(home, p);
  if (relativeToHome.substr(0, 3) === ('..' + files.pathSep)) {
    return p;
  }
  return files.pathJoin('~', relativeToHome);
};

// Like statSync, but null if file not found
files.statOrNull = function (path) {
  return statOrNull(path);
};

function statOrNull(path, preserveSymlinks) {
  try {
    return preserveSymlinks
      ? files.lstat(path)
      : files.stat(path);
  } catch (e) {
    if (e.code === "ENOENT") {
      return null;
    }
    throw e;
  }
}

export function realpathOrNull(path) {
  try {
    return files.realpath(path);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    return null;
  }
}

files.rm_recursive_async = (path) => {
  return new Promise((resolve, reject) => {
    rimraf(files.convertToOSPath(path), err => err
      ? reject(err)
      : resolve());
  });
};

// Like rm -r.
files.rm_recursive = Profile("files.rm_recursive", (path) => {
  try {
    rimraf.sync(files.convertToOSPath(path));
  } catch (e) {
    if ((e.code === "ENOTEMPTY" ||
         e.code === "EPERM") &&
        canYield()) {
      files.rm_recursive_async(path).await();
      return;
    }
    throw e;
  }
});

// Returns the base64 SHA256 of the given file.
files.fileHash = function (filename) {
  var crypto = require('crypto');
  var hash = crypto.createHash('sha256');
  hash.setEncoding('base64');
  var rs = files.createReadStream(filename);
  return new Promise(function (resolve) {
    rs.on('end', function () {
      rs.close();
      resolve(hash.digest('base64'));
    });
    rs.pipe(hash, { end: false });
  }).await();
};

// This is the result of running fileHash on a blank file.
files.blankHash = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";

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

    var absPath = files.pathJoin(root, relativePath);
    var stat = files.lstat(absPath);

    if (stat.isDirectory()) {
      if (relativePath) {
        updateHash('dir ' + JSON.stringify(relativePath) + '\n');
      }
      _.each(files.readdir(absPath), function (entry) {
        traverse(files.pathJoin(relativePath, entry));
      });
    } else if (stat.isFile()) {
      if (!relativePath) {
        throw Error("must call files.treeHash on a directory");
      }
      updateHash('file ' + JSON.stringify(relativePath) + ' ' +
                  stat.size + ' ' + files.fileHash(absPath) + '\n');
      if (stat.mode & 0o100) {
        updateHash('exec\n');
      }
    } else if (stat.isSymbolicLink()) {
      if (!relativePath) {
        throw Error("must call files.treeHash on a directory");
      }
      updateHash('symlink ' + JSON.stringify(relativePath) + ' ' +
                 JSON.stringify(files.readlink(absPath)) + '\n');
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
  var p = files.pathResolve(dir);
  var ps = files.pathNormalize(p).split(files.pathSep);

  var stat = files.statOrNull(p);
  if (stat) {
    return stat.isDirectory();
  }

  // doesn't exist. recurse to build parent.
  // Don't use files.pathJoin here because it can strip off the leading slash
  // accidentally.
  var parentPath = ps.slice(0, -1).join(files.pathSep);
  var success = files.mkdir_p(parentPath, mode);
  // parent is not a directory.
  if (! success) { return false; }

  var pathIsDirectory = function (path) {
    var stat = files.statOrNull(path);
    return stat && stat.isDirectory();
  };

  try {
    files.mkdir(p, mode);
  } catch (err) {
    if (err.code === "EEXIST") {
      if (pathIsDirectory(p)) {
        // all good, someone else created this directory for us while we were
        // yielding
        return true;
      } else {
        return false;
      }
    } else {
      throw err;
    }
  }

  // double check we exist now
  return pathIsDirectory(p);
};

// Roughly like cp -R.
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
files.cp_r = function(from, to, options = {}) {
  from = files.pathResolve(from);

  const stat = statOrNull(from, options.preserveSymlinks);
  if (! stat) {
    return;
  }

  if (stat.isDirectory()) {
    files.mkdir_p(to, 0o755);

    files.readdir(from).forEach(f => {
      if (options.ignore &&
          _.any(options.ignore,
                pattern => f.match(pattern))) {
        return;
      }

      const fullFrom = files.pathJoin(from, f);

      if (options.transformFilename) {
        f = options.transformFilename(f);
      }

      files.cp_r(
        fullFrom,
        files.pathJoin(to, f),
        options
      );
    })

    return;
  }

  files.mkdir_p(files.pathDirname(to));

  if (stat.isSymbolicLink()) {
    symlinkWithOverwrite(files.readlink(from), to);

  } else {
    // Create the file as readable and writable by everyone, and
    // executable by everyone if the original file is executable by
    // owner. (This mode will be modified by umask.) We don't copy the
    // mode *directly* because this function is used by 'meteor create'
    // which is copying from the read-only tools tree into a writable app.
    const mode = (stat.mode & 0o100) ? 0o777 : 0o666;

    if (options.transformContents) {
      files.writeFile(to, options.transformContents(
        files.readFile(from),
        files.pathBasename(from)
      ), { mode });

    } else {
      copyFileHelper(from, to, mode);
    }
  }
};

// create a symlink, overwriting the target link, file, or directory
// if it exists
export function symlinkWithOverwrite(source, target) {
  const args = [source, target];

  if (process.platform === "win32") {
    const absoluteSource = files.pathResolve(target, source);

    if (files.stat(absoluteSource).isDirectory()) {
      args[2] = "junction";
    }
  }

  try {
    files.symlink(...args);
  } catch (e) {
    if (e.code === "EEXIST") {
      if (files.lstat(target).isSymbolicLink() &&
          files.readlink(target) === source) {
        // If the target already points to the desired source, we don't
        // need to do anything.
        return;
      }
      // overwrite existing link, file, or directory
      files.rm_recursive(target);
      files.symlink(...args);
    } else {
      throw e;
    }
  }
}

/**
 * Get every path in a directory recursively, treating symlinks as files
 * @param  {String} dir     The directory to walk, either relative to options.cwd or completely absolute
 * @param  {Object} options Some options
 * @param {String} options.cwd The directory that paths should be relative to
 * @param {String[]} options.output An array to push results to
 * @return {String[]}         All of the paths in the directory recursively
 */
files.getPathsInDir = function (dir, options) {
  // Don't let this function yield so that the file system doesn't get changed
  // underneath us
  return fiberHelpers.noYieldsAllowed(function () {
    var cwd = options.cwd || files.convertToStandardPath(process.cwd());

    if (! files.exists(cwd)) {
      throw new Error("Specified current working directory doesn't exist: " +
        cwd);
    }

    var absoluteDir = files.pathResolve(cwd, dir);

    if (! files.exists(absoluteDir)) {
      // There are no paths in this dir, so don't do anything
      return;
    }

    var output = options.output || [];

    var pathIsDirectory = function (path) {
      var stat = files.lstat(path);
      return stat.isDirectory();
    };

    _.each(files.readdir(absoluteDir), function (entry) {
      var newPath = files.pathJoin(dir, entry);
      var newAbsPath = files.pathJoin(absoluteDir, entry);

      output.push(newPath);

      if (pathIsDirectory(newAbsPath)) {
        files.getPathsInDir(newPath, {
          cwd: cwd,
          output: output
        });
      }
    });

    return output;
  });
};

files.findPathsWithRegex = function (dir, regex, options) {
  var allPaths = files.getPathsInDir(dir, {
    cwd: options.cwd
  });

  return _.filter(allPaths, function (path) {
    return path.match(regex);
  });
};

// Copies a file, which is expected to exist. Parent directories of "to" do not
// have to exist. Treats symbolic links transparently (copies the contents, not
// the link itself, and it's an error if the link doesn't point to a file).
files.copyFile = function (from, to, origMode=null) {
  files.mkdir_p(files.pathDirname(files.pathResolve(to)), 0o755);

  if (origMode === null) {
    var stats = files.stat(from);
    if (!stats.isFile()) {
      throw Error("cannot copy non-files");
    }
    origMode = stats.mode;
  }

  // Create the file as readable and writable by everyone, and executable by
  // everyone if the original file is executably by owner. (This mode will be
  // modified by umask.) We don't copy the mode *directly* because this function
  // is used by 'meteor create' which is copying from the read-only tools tree
  // into a writable app.
  var mode = (origMode & 0o100) ? 0o777 : 0o666;

  copyFileHelper(from, to, mode);
};
files.copyFile = Profile("files.copyFile", files.copyFile);

var copyFileHelper = function (from, to, mode) {
  var readStream = files.createReadStream(from);
  var writeStream = files.createWriteStream(to, { mode: mode });
  new Promise(function (resolve, reject) {
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('open', function () {
      readStream.pipe(writeStream);
    });
    writeStream.once('finish', resolve);
  }).await();
};

// Make a temporary directory. Returns the path to the newly created
// directory. Only the current user is allowed to read or write the
// files in the directory (or add files to it). The directory will
// be cleaned up on exit.
const tempDirs = Object.create(null);
files.mkdtemp = function (prefix) {
  var make = function () {
    prefix = prefix || 'mt-';
    // find /tmp
    var tmpDir = _.first(_.map(['TMPDIR', 'TMP', 'TEMP'], function (t) {
      return process.env[t];
    }).filter(_.identity));

    if (! tmpDir && process.platform !== 'win32') {
      tmpDir = '/tmp';
    }

    if (! tmpDir) {
      throw new Error("Couldn't create a temporary directory.");
    }

    tmpDir = files.realpath(tmpDir);

    // make the directory. give it 3 tries in case of collisions from
    // crappy random.
    var tries = 3;
    while (tries > 0) {
      var dirPath = files.pathJoin(
        tmpDir, prefix + (Math.random() * 0x100000000 + 1).toString(36));
      try {
        files.mkdir(dirPath, 0o700);
        return dirPath;
      } catch (err) {
        tries--;
      }
    }
    throw new Error("failed to make temporary directory in " + tmpDir);
  };
  var dir = make();
  tempDirs[dir] = true;
  return dir;
};

// Call this if you're done using a temporary directory. It will asynchronously
// be deleted.
files.freeTempDir = function (dir) {
  if (! tempDirs[dir]) {
    throw Error("not a tracked temp dir: " + dir);
  }

  if (process.env.METEOR_SAVE_TMPDIRS) {
    return;
  }

  return files.rm_recursive_async(dir).then(() => {
    // Delete tempDirs[dir] only when the removal finishes, so that the
    // cleanup.onExit handler can attempt the removal synchronously if it
    // fires in the meantime.
    delete tempDirs[dir];
  }, error => {
    // Leave tempDirs[dir] in place so the cleanup.onExit handler can try
    // to delete it again when the process exits.
    console.log(error);
  });
};

if (! process.env.METEOR_SAVE_TMPDIRS) {
  cleanup.onExit(function (sig) {
    Object.keys(tempDirs).forEach(dir => {
      delete tempDirs[dir];
      try {
        files.rm_recursive(dir);
      } catch (err) {
        // Don't crash and print a stack trace because we failed to delete
        // a temp directory. This happens sometimes on Windows and seems
        // to be unavoidable.
      }
    });
  });
}

// Takes a buffer containing `.tar.gz` data and extracts the archive
// into a destination directory. destPath should not exist yet, and
// the archive should contain a single top-level directory, which will
// be renamed atomically to destPath.
files.extractTarGz = function (buffer, destPath, options) {
  var options = options || {};
  var parentDir = files.pathDirname(destPath);
  var tempDir = files.pathJoin(parentDir, '.tmp' + utils.randomToken());
  files.mkdir_p(tempDir);

  if (! _.has(options, "verbose")) {
    options.verbose = require("../console/console.js").Console.verbose;
  }

  const startTime = +new Date;

  let promise = process.platform === "win32"
    ? tryExtractWithNative7z(buffer, tempDir, options)
    : tryExtractWithNativeTar(buffer, tempDir, options)

  promise = promise.catch(
    error => tryExtractWithNpmTar(buffer, tempDir, options)
  );

  promise.await();

  // succeed!
  var topLevelOfArchive = files.readdir(tempDir)
    // On Windows, the 7z.exe tool sometimes creates an auxiliary
    // PaxHeader directory.
    .filter(file => ! file.startsWith("PaxHeader"));

  if (topLevelOfArchive.length !== 1) {
    throw new Error(
      "Extracted archive '" + tempDir + "' should only contain one entry");
  }

  var extractDir = files.pathJoin(tempDir, topLevelOfArchive[0]);
  files.rename(extractDir, destPath);
  files.rm_recursive(tempDir);

  if (options.verbose) {
    console.log("Finished extracting in", new Date - startTime, "ms");
  }
};

function ensureDirectoryEmpty(dir) {
  files.readdir(dir).forEach(file => {
    files.rm_recursive(files.pathJoin(dir, file));
  });
}

function tryExtractWithNativeTar(buffer, tempDir, options) {
  ensureDirectoryEmpty(tempDir);

  if (options.forceConvert) {
    return Promise.reject(new Error(
      "Native tar cannot convert colons in package names"));
  }

  return new Promise((resolve, reject) => {
    const flags = options.verbose ? "-xzvf" : "-xzf";
    const tarProc = spawn("tar", [flags, "-"], {
      cwd: files.convertToOSPath(tempDir),
      stdio: options.verbose ? [
        "pipe", // Always need to write to tarProc.stdin.
        process.stdout,
        process.stderr
      ] : "pipe",
    });

    tarProc.on("error", reject);
    tarProc.on("exit", resolve);

    tarProc.stdin.write(buffer);
    tarProc.stdin.end();
  });
}

function tryExtractWithNative7z(buffer, tempDir, options) {
  ensureDirectoryEmpty(tempDir);

  if (options.forceConvert) {
    return Promise.reject(new Error(
      "Native 7z.exe cannot convert colons in package names"));
  }

  const exeOSPath = files.convertToOSPath(
    files.pathJoin(files.getCurrentNodeBinDir(), "7z.exe"));
  const tarGzBasename = "out.tar.gz";
  const spawnOptions = {
    cwd: files.convertToOSPath(tempDir),
    stdio: options.verbose ? "inherit" : "pipe",
  };

  files.writeFile(files.pathJoin(tempDir, tarGzBasename), buffer);

  return new Promise((resolve, reject) => {
    spawn(exeOSPath, [
      "x", "-y", tarGzBasename
    ], spawnOptions)
      .on("error", reject)
      .on("exit", resolve);

  }).then(code => {
    assert.strictEqual(code, 0);

    let tarBasename;
    const foundTar = files.readdir(tempDir).some(file => {
      if (file !== tarGzBasename) {
        tarBasename = file;
        return true;
      }
    });

    assert.ok(foundTar, "failed to find .tar file");

    function cleanUp() {
      files.unlink(files.pathJoin(tempDir, tarGzBasename));
      files.unlink(files.pathJoin(tempDir, tarBasename));
    }

    return new Promise((resolve, reject) => {
      spawn(exeOSPath, [
        "x", "-y", tarBasename
      ], spawnOptions)
        .on("error", reject)
        .on("exit", resolve);

    }).then(code => {
      cleanUp();
      return code;
    }, error => {
      cleanUp();
      throw error;
    });
  });
}

function tryExtractWithNpmTar(buffer, tempDir, options) {
  ensureDirectoryEmpty(tempDir);

  var tar = require("tar");
  var zlib = require("zlib");

  return new Promise((resolve, reject) => {
    var gunzip = zlib.createGunzip().on('error', reject);
    var extractor = new tar.Extract({
      path: files.convertToOSPath(tempDir)
    }).on('entry', function (e) {
      if (process.platform === "win32" || options.forceConvert) {
        // On Windows, try to convert old packages that have colons in
        // paths by blindly replacing all of the paths. Otherwise, we
        // can't even extract the tarball
        e.path = colonConverter.convert(e.path);
      }
    }).on('error', reject)
      .on('end', resolve);

    // write the buffer to the (gunzip|untar) pipeline; these calls
    // cause the tar to be extracted to disk.
    gunzip.pipe(extractor);
    gunzip.write(buffer);
    gunzip.end();
  });
}

// In the same fashion as node-pre-gyp does, add the executable
// bit but only if the read bit was present.  Same as:
// https://github.com/mapbox/node-pre-gyp/blob/7a28f4b0f562ba4712722fefe4eeffb7b20fbf7a/lib/install.js#L71-L77
// and others reported in: https://github.com/npm/node-tar/issues/7
function addExecBitWhenReadBitPresent(fileMode) {
  return fileMode |= (fileMode >>> 2) & 0o111;
}

// Tar-gzips a directory, returning a stream that can then be piped as
// needed.  The tar archive will contain a top-level directory named
// after dirPath.
files.createTarGzStream = function (dirPath, options) {
  var tar = require("tar");
  var fstream = require('fstream');
  var zlib = require("zlib");

  // Create a segment of the file path which we will look for to
  // identify exactly what we think is a "bin" file (that is, something
  // which should be expected to work within the context of an
  // 'npm run-script').
  var binPathMatch = ["", "node_modules", ".bin", ""].join(path.sep);

  // Don't use `{ path: dirPath, type: 'Directory' }` as an argument to
  // fstream.Reader. This triggers a collection of odd behaviors in fstream
  // (which might be bugs or might just be weirdnesses).
  //
  // First, if we pass an object with `type: 'Directory'` as an argument, then
  // the resulting tarball has no entry for the top-level directory, because
  // the reader emits an entry (with just the path, no permissions or other
  // properties) before the pipe to gzip is even set up, so that entry gets
  // lost. Even if we pause the streams until all the pipes are set up, we'll
  // get the entry in the tarball for the top-level directory without
  // permissions or other properties, which is problematic. Just passing
  // `dirPath` appears to cause `fstream` to stat the directory before emitting
  // an entry for it, so the pipes are set up by the time the entry is emitted,
  // and the entry has all the right permissions, etc. from statting it.
  //
  // The second weird behavior is that we need an entry for the top-level
  // directory in the tarball to untar it with npm `tar`. (GNU tar, in
  // contrast, appears to have no problems untarring tarballs without entries
  // for the top-level directory inside them.) The problem is that, without an
  // entry for the top-level directory, `fstream` will create the directory
  // with the same permissions as the first file inside it. This manifests as
  // an EACCESS when untarring if the first file inside the top-level directory
  // is not writeable.
  var fileStream = fstream.Reader({
    path: files.convertToOSPath(dirPath),
    filter: function (entry) {
      if (process.platform !== "win32") {
        return true;
      }

      // Refuse to create a directory that isn't listable. Tarballs
      // created on Windows will have non-executable directories (since
      // executable isn't a thing in Windows directory permissions), and
      // so the resulting extracted directories will not be listable on
      // Linux/Mac unless we explicitly make them executable. We think
      // this should really be an option that you pass to node tar, but
      // setting it in an 'entry' handler is the same strategy that npm
      // does, so we do that here too.
      if (entry.type === "Directory") {
        entry.props.mode = addExecBitWhenReadBitPresent(entry.props.mode);
      }

      // In a similar way as for directories, but only if is in a path
      // location that is expected to be executable (npm "bin" links)
      if (entry.type === "File" && entry.path.indexOf(binPathMatch) > -1) {
        entry.props.mode = addExecBitWhenReadBitPresent(entry.props.mode);
      }

      return true;
    }
  });
  var tarStream = fileStream.pipe(tar.Pack({ noProprietary: true }));

  return tarStream.pipe(zlib.createGzip());
};

// Tar-gzips a directory into a tarball on disk, synchronously.
// The tar archive will contain a top-level directory named after dirPath.
files.createTarball = Profile(function (dirPath, tarball) {
  return "files.createTarball " + files.pathBasename(tarball);
}, function (dirPath, tarball, options) {
  var out = files.createWriteStream(tarball);
  new Promise(function (resolve, reject) {
    out.on('error', reject);
    out.on('close', resolve);
    files.createTarGzStream(dirPath, options).pipe(out);
  }).await();
});

// Use this if you'd like to replace a directory with another
// directory as close to atomically as possible. It's better than
// recursively deleting the target directory first and then
// renaming. (Failure modes here include "there's a brief moment where
// toDir does not exist" and "you can end up with garbage directories
// sitting around", but not "there's any time where toDir exists but
// is in a state other than initial or final".)
files.renameDirAlmostAtomically =
  Profile("files.renameDirAlmostAtomically", (fromDir, toDir) => {
    const garbageDir = `${toDir}-garbage-${utils.randomToken()}`;

    // Get old dir out of the way, if it exists.
    let cleanupGarbage = false;
    let forceCopy = false;
    try {
      files.rename(toDir, garbageDir);
      cleanupGarbage = true;
    } catch (e) {
      if (e.code === 'EXDEV') {
        // Some (notably Docker) file systems will fail to do a seemingly
        // harmless operation, such as renaming, on what is apparently the same
        // file system.  AUFS will do this even if the `fromDir` and `toDir`
        // are on the same layer, and OverlayFS will fail if the `fromDir` and
        // `toDir` are on different layers.  In these cases, we will not be
        // atomic and will need to do a recursive copy.
        forceCopy = true;
      } else if (e.code !== 'ENOENT') {
        // No such file or directory is okay, but anything else is not.
        throw e;
      }
    }

    if (! forceCopy) {
      try {
        files.rename(fromDir, toDir);
      } catch (e) {
        // It's possible that there may not have been a `toDir` to have
        // advanced warning about this, so we're prepared to handle it again.
        if (e.code === 'EXDEV') {
          forceCopy = true;
        } else {
          throw e;
        }
      }
    }

    // If we've been forced to jeopardize our atomicity due to file-system
    // limitations, we'll resort to copying.
    if (forceCopy) {
      files.rm_recursive(toDir);
      files.cp_r(fromDir, toDir, {
        preserveSymlinks: true,
      });
    }

    // ... and take out the trash.
    if (cleanupGarbage) {
      // We don't care about how long this takes, so we'll let it go async.
      files.rm_recursive(garbageDir);
    }
  });

files.writeFileAtomically =
  Profile("files.writeFileAtomically", function (filename, contents) {
    const parentDir = files.pathDirname(filename);
    files.mkdir_p(parentDir);

    const tmpFile = files.pathJoin(
      parentDir,
      '.' + files.pathBasename(filename) + '.' + utils.randomToken()
    );

    files.writeFile(tmpFile, contents);
    files.rename(tmpFile, filename);
  });

// Like fs.symlinkSync, but creates a temporay link and renames it over the
// file; this means it works even if the file already exists.
// Do not use this function on Windows, it won't work.
files.symlinkOverSync = function (linkText, file) {
  fiberHelpers.noYieldsAllowed(function () {
    file = files.pathResolve(file);
    var tmpSymlink = files.pathJoin(
      files.pathDirname(file),
      "." + files.pathBasename(file) + ".tmp" + utils.randomToken());
    files.symlink(linkText, tmpSymlink);
    files.rename(tmpSymlink, file);
  });
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
  if (typeof code !== 'string') {
    throw new Error("code must be a string");
  }

  options = options || {};
  var filename = options.filename || "<anonymous>";

  return Profile.time('runJavaScript ' + filename, () => {

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
        parsedSourceMap.sourceRoot = files.pathJoin(
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
      if (!(nodeParseError instanceof SyntaxError)) {
        throw nodeParseError;
      }
      // Got a parse error. Unfortunately, we can't actually get the
      // location of the parse error from the SyntaxError; Node has some
      // hacky support for displaying it over stderr if you pass an
      // undocumented third argument to stackFilename, but that's not
      // what we want. See
      //    https://github.com/joyent/node/issues/3452
      // for more information. One thing to try (and in fact, what an
      // early version of this function did) is to actually fork a new
      // node to run the code and parse its output. We instead run an
      // entirely different JS parser, from the Babel project, but
      // which at least has a nice API for reporting errors.
      var parse = require('meteor-babel').parse;
      try {
        parse(wrapped, { strictMode: false });
      } catch (parseError) {
        if (typeof parseError.loc !== "object") {
          throw parseError;
        }

        var err = new files.FancySyntaxError;
        err.message = parseError.message;

        if (parsedSourceMap) {
          // XXX this duplicates code in computeGlobalReferences
          var consumer2 = new sourcemap.SourceMapConsumer(parsedSourceMap);
          var original = consumer2.originalPositionFor(parseError.loc);
          if (original.source) {
            err.file = original.source;
            err.line = original.line;
            err.column = original.column;
            throw err;
          }
        }

        err.file = filename;  // *not* stackFilename
        err.line = parseError.loc.line;
        err.column = parseError.loc.column;

        // adjust errors on line 1 to account for our header
        if (err.line === 1) {
          err.column -= header.length;
        }

        throw err;
      }

      // What? Node thought that this was a parse error and Babel didn't?
      // Eh, just throw Node's error and don't care too much about the line
      // numbers being right.
      throw nodeParseError;
    }

    var func = script.runInThisContext();

    return (buildmessage.markBoundary(func)).apply(null, values);
  });
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
    if (e.code === 'ENOENT') {
      return [];
    }
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
    if (line.match(/\S/)) {
      break;
    }
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
    if (e && e.code === 'ENOENT') {
      return [];
    }
    throw e;
  }
};

// Returns null if the file does not exist, otherwise returns the parsed JSON in
// the file. Throws on errors other than ENOENT (including JSON parse failure).
exports.readJSONOrNull = function (file) {
  try {
    var raw = files.readFile(file, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return null;
    }
    throw e;
  }
  return JSON.parse(raw);
};

// Trims whitespace & other filler characters of a line in a project file.
files.trimSpaceAndComments = function (line) {
  var match = line.match(/^([^#]*)#/);
  if (match) {
    line = match[1];
  }
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

files.getHomeDir = function () {
  if (process.platform === "win32") {
    return files.pathDirname(
      files.convertToStandardPath(process.env.METEOR_INSTALLATION));
  } else {
    return process.env.HOME;
  }
};

files.currentEnvWithPathsAdded = function (...paths) {
  const env = {...process.env};

  let pathPropertyName;
  if (process.platform === "win32") {
    // process.env allows for case insensitive access on Windows, but copying it
    // creates a normal JavaScript object with case sensitive property access.
    // This leads to problems, because we would be adding a PATH property instead
    // of setting Path for instance.
    // We want to make sure we're setting the right property, so we
    // lookup the property name case insensitively ourselves.
    pathPropertyName = _.find(Object.keys(env), (key) => {
      return key.toUpperCase() === 'PATH';
    });
    if (!pathPropertyName) {
      pathPropertyName = 'Path';
    }
  } else {
    pathPropertyName = 'PATH';
  }

  const convertedPaths = paths.map(path => files.convertToOSPath(path));
  let pathDecomposed = (env[pathPropertyName] || "").split(files.pathOsDelimiter);
  pathDecomposed.unshift(...convertedPaths);

  env[pathPropertyName] = pathDecomposed.join(files.pathOsDelimiter);
  return env;
}

// add .bat extension to link file if not present
var ensureBatExtension = function (p) {
  if (p.indexOf(".bat") !== p.length - 4) {
    p = p + ".bat";
  }
  return p;
};

// Windows-only, generates a bat script that calls the destination bat script
files._generateScriptLinkToMeteorScript = function (scriptLocation) {
  var scriptLocationIsAbsolutePath = scriptLocation.match(/^\//);
  var scriptLocationConverted = scriptLocationIsAbsolutePath
    ? files.convertToWindowsPath(scriptLocation)
    : "%~dp0\\" + files.convertToWindowsPath(scriptLocation);

  var newScript = [
    "@echo off",
    "SETLOCAL",
    "SET METEOR_INSTALLATION=%~dp0%",

    // always convert to Windows path since this function can also be
    // called on Linux or Mac when we are building bootstrap tarballs
    "\"" + scriptLocationConverted + "\" %*",
    "ENDLOCAL",

    // always exit with the same exit code as the child script
    "EXIT /b %ERRORLEVEL%",

    // add a comment with the destination of the link, so it can be read later
    // by files.readLinkToMeteorScript
    "rem " + scriptLocationConverted,
  ].join(os.EOL);

  return newScript;
};

files._getLocationFromScriptLinkToMeteorScript = function (script) {
  var lines = _.compact(script.toString().split('\n'));

  var scriptLocation = _.last(lines)
    .replace(/^rem /g, '');
  var isAbsolute = true;

  if (scriptLocation.match(/^%~dp0/)) {
    isAbsolute = false;
    scriptLocation = scriptLocation.replace(/^%~dp0\\?/g, '');
  }

  if (! scriptLocation) {
    throw new Error('Failed to parse script location from meteor.bat');
  }

  return files.convertToPosixPath(scriptLocation, ! isAbsolute);
};

files.linkToMeteorScript = function (scriptLocation, linkLocation, platform) {
  platform = platform || process.platform;

  if (platform === 'win32') {
    // Make a meteor batch script that points to current tool

    linkLocation = ensureBatExtension(linkLocation);
    scriptLocation = ensureBatExtension(scriptLocation);
    var script = files._generateScriptLinkToMeteorScript(scriptLocation);

    files.writeFile(linkLocation, script, {encoding: "ascii"});
  } else {
    // Symlink meteor tool
    files.symlinkOverSync(scriptLocation, linkLocation);
  }
};

files.readLinkToMeteorScript = function (linkLocation, platform) {
  platform = platform || process.platform;
  if (platform === 'win32') {
    linkLocation = ensureBatExtension(linkLocation);
    var script = files.readFile(linkLocation);
    return files._getLocationFromScriptLinkToMeteorScript(script);
  } else {
    return files.readlink(linkLocation);
  }
};

// Summary of cross platform file system handling strategy

// There are three main pain points for handling files on Windows: slashes in
// paths, line endings in text files, and colons/invalid characters in paths.

// 1. Slashes in file paths

//   We have decided to store all paths inside the tool as unix-style paths in
//   the style of CYGWIN. This means that all paths have forward slashes on all
//   platforms, and C:\ is converted to /c/ on Windows.

//   All of the methods in files.js know how to convert from these unixy paths
//   to whatever type of path the underlying system prefers.

//   The reason we chose this strategy because it was easier to make sure to use
//   files.js everywhere instead of node's fs than to make sure every part of
//   the tool correctly uses system-specific path separators. In addition, there
//   are some parts of the tool where it is very hard to tell which strings are
//   used as URLs and which are used as file paths. In some cases, a string can
//   be used as both, meaning it has to have forward slashes no matter what.

// 2. Line endings in text files

//   We have decided to convert all files read by the tool to Unix-style line
//   endings for the same reasons as slashes above. In many parts of the tool,
//   we assume that '\n' is the line separator, and it can be hard to find all
//   of the places and decide whether it is appropriate to use os.EOL. We do not
//   convert anything on write. We will wait and see if anyone complains.

// 3. Colons and other invalid characters in file paths

//   This is not handled automatically by files.js. You need to be careful to
//   escape any colons in package names, etc, before using a string as a file
//   path.

//   A helpful file to import for this purpose is colon-converter.js, which also
//   knows how to convert various configuration file formats.

files.fsFixPath = {};
/**
 * Wrap a function from node's fs module to use the right slashes for this OS
 * and run in a fiber, then assign it to the "files" namespace. Each call
 * creates a files.func that runs asynchronously with Fibers (yielding and
 * until the call is done), unless run outside a Fiber or in noYieldsAllowed, in
 * which case it uses fs.funcSync.
 *
 * Also creates a simpler version on files.fsFixPath.* that just fixes the path
 * and fiberizes the Sync version if possible.
 *
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

  const fsFunc = fs[fsFuncName];
  const fsFuncSync = fs[fsFuncName + "Sync"];

  function makeWrapper ({alwaysSync, sync}) {
    function wrapper(...args) {
      for (let j = pathArgIndices.length - 1; j >= 0; --j) {
        const i = pathArgIndices[j];
        args[i] = files.convertToOSPath(args[i]);
      }

      const shouldBeSync = alwaysSync || sync;
      // There's some overhead in awaiting a Promise of an async call,
      // vs just doing the sync call, which for a call like "stat"
      // takes longer than the call itself.  Different parts of the tool
      // may perform 1,000s or 10,000s of stats each under certain
      // conditions, so we get a nice performance boost from making
      // these calls sync.
      const isQuickie = (fsFuncName === 'stat' ||
                         fsFuncName === 'rename' ||
                         fsFuncName === 'symlink');

      const dirty = options && options.dirty;
      const dirtyFn = typeof dirty === "function" ? dirty : null;

      if (mayYield() &&
          shouldBeSync &&
          ! isQuickie) {
        const promise = new Promise((resolve, reject) => {
          args.push((err, value) => {
            if (options.noErr) {
              resolve(err);
            } else if (err) {
              reject(err);
            } else {
              resolve(value);
            }
          });

          fsFunc.apply(fs, args);
        });

        const result = promise.await();

        if (dirtyFn) {
          dirtyFn(...args);
        }

        return options.modifyReturnValue
          ? options.modifyReturnValue(result)
          : result;

      } else if (shouldBeSync) {
        // Should be sync but can't yield: we are not in a Fiber.
        // Run the sync version of the fs.* method.
        const result = fsFuncSync.apply(fs, args);

        if (dirtyFn) {
          dirtyFn(...args);
        }

        return options.modifyReturnValue ?
               options.modifyReturnValue(result) : result;

      } else if (! sync) {
        // wrapping a plain async version
        let cb = args[args.length - 1];
        if (typeof cb === "function") {
          args.pop();
        } else {
          cb = null;
        }

        new Promise((resolve, reject) => {
          args.push((err, res) => {
            err ? reject(err) : resolve(res);
          });

          fsFunc.apply(fs, args);

        }).then(res => {
          if (dirtyFn) {
            dirtyFn(...args);
          }

          if (options.modifyReturnValue) {
            res = options.modifyReturnValue(res);
          }

          cb && cb(null, res);

        }, cb);

        return;
      }

      throw new Error('unexpected');
    }

    wrapper.displayName = fsFuncName;
    return wrapper;
  }

  files[fsFuncName] = Profile('files.' + fsFuncName, makeWrapper({ alwaysSync: true }));

  files.fsFixPath[fsFuncName] =
    Profile('wrapped.fs.' + fsFuncName, makeWrapper({ sync: false }));
  files.fsFixPath[fsFuncName + 'Sync'] =
    Profile('wrapped.fs.' + fsFuncName + 'Sync', makeWrapper({ sync: true }));
}

let dependOnPathSalt = 0;
export const dependOnPath = require("optimism").wrap(
  // Always return something different to prevent optimism from
  // second-guessing the dirtiness of this function.
  path => ++dependOnPathSalt,
  // This function is disposable because we don't care about its result,
  // only its role in optimistic dependency tracking/dirtying.
  { disposable: true }
);

function wrapDestructiveFsFunc(name, pathArgIndices) {
  pathArgIndices = pathArgIndices || [0];
  wrapFsFunc(name, pathArgIndices, {
    dirty(...args) {
      // Immediately reset all optimistic functions (defined in
      // tools/fs/optimistic.js) that depend on these paths.
      pathArgIndices.forEach(i => dependOnPath.dirty(args[i]));
    }
  });
}

wrapDestructiveFsFunc("writeFile");
wrapDestructiveFsFunc("appendFile");

wrapFsFunc("readFile", [0], {
  modifyReturnValue: function (fileData) {
    if (_.isString(fileData)) {
      return files.convertToStandardLineEndings(fileData);
    }

    return fileData;
  }
});

wrapFsFunc("stat", [0]);
wrapFsFunc("lstat", [0]);

wrapDestructiveFsFunc("rename", [0, 1]);

// After the outermost files.withCache call returns, the withCacheCache is
// reset to null so that it does not survive server restarts.
let withCacheCache = null;

files.withCache = Profile("files.withCache", function (fn) {
  const oldCache = withCacheCache;
  withCacheCache = oldCache || Object.create(null);
  try {
    return fn();
  } finally {
    withCacheCache = oldCache;
  }
});

function enableCache(name) {
  const method = files[name];

  function makeCacheKey(args) {
    var parts = [name];

    for (var i = 0; i < args.length; ++i) {
      var arg = args[i];

      if (typeof arg !== "string") {
        // If any of the arguments is not a string, then we won't cache
        // the result of the corresponding file.* method invocation.
        return null;
      }

      parts.push(arg);
    }

    return parts.join("\0");
  }

  files[name] = function (...args) {
    if (withCacheCache) {
      var cacheKey = makeCacheKey(args);
      if (cacheKey && cacheKey in withCacheCache) {
        return withCacheCache[cacheKey];
      }
    }

    const result = method.apply(files, args);

    if (withCacheCache && cacheKey !== null) {
      // If cacheKey === null, then we called makeCacheKey above and it
      // failed because one of the arguments was not a string, so we
      // should not try to call makeCacheKey again.
      withCacheCache[cacheKey || makeCacheKey(args)] = result;
    }

    return result;
  };
}

enableCache("readdir");
enableCache("realpath");
enableCache("stat");
enableCache("lstat");

// The fs.exists method is deprecated in Node v4:
// https://nodejs.org/api/fs.html#fs_fs_exists_path_callback
files.exists =
files.existsSync = function (path, callback) {
  if (typeof callback === "function") {
    throw new Error("Passing a callback to files.exists is no longer supported");
  }
  return !! files.statOrNull(path);
};

if (files.isWindowsLikeFilesystem()) {
  const rename = files.rename;

  files.rename = function (from, to) {
    // Retries are necessary only on Windows, because the rename call can
    // fail with EBUSY, which means the file is in use.
    let maxTries = 10;
    let success = false;
    const osTo = files.convertToOSPath(to);

    while (! success && maxTries-- > 0) {
      try {
        // Despite previous failures, the top-level destination directory
        // may have been successfully created, so we must remove it to
        // avoid moving the source file *into* the destination directory.
        rimraf.sync(osTo);
        rename(from, to);
        success = true;
      } catch (err) {
        if (err.code !== 'EPERM' && err.code !== 'EACCES') {
          throw err;
        }
      }
    }

    if (! success) {
      files.cp_r(from, to, { preserveSymlinks: true });
      files.rm_recursive(from);
    }
  };
}

// Warning: doesn't convert slashes in the second 'cache' arg
wrapFsFunc("realpath", [0], {
  modifyReturnValue: files.convertToStandardPath
});

wrapFsFunc("readdir", [0], {
  modifyReturnValue: function (entries) {
    return _.map(entries, files.convertToStandardPath);
  }
});

wrapDestructiveFsFunc("rmdir");
wrapDestructiveFsFunc("mkdir");
wrapDestructiveFsFunc("unlink");
wrapDestructiveFsFunc("chmod");

wrapFsFunc("open", [0]);

// XXX this doesn't give you the second argument to the callback
wrapFsFunc("read", []);
wrapFsFunc("write", []);
wrapFsFunc("close", []);
wrapFsFunc("symlink", [0, 1]);
wrapFsFunc("readlink", [0]);

// These don't need to be Fiberized
files.createReadStream = function (...args) {
  args[0] = files.convertToOSPath(args[0]);
  return fs.createReadStream(...args);
};

files.createWriteStream = function (...args) {
  args[0] = files.convertToOSPath(args[0]);
  return fs.createWriteStream(...args);
};

files.watchFile = function (...args) {
  args[0] = files.convertToOSPath(args[0]);
  return fs.watchFile(...args);
};

files.unwatchFile = function (...args) {
  args[0] = files.convertToOSPath(args[0]);
  return fs.unwatchFile(...args);
};

files.readBufferWithLengthAndOffset = function (filename, length, offset) {
  var data = new Buffer(length);
  // Read the data from disk, if it is non-empty. Avoid doing IO for empty
  // files, because (a) unnecessary and (b) fs.readSync with length 0
  // throws instead of acting like POSIX read:
  // https://github.com/joyent/node/issues/5685
  if (length > 0) {
    var fd = files.open(filename, "r");
    try {
      var count = files.read(
        fd, data, 0, length, offset);
    } finally {
      files.close(fd);
    }
    if (count !== length) {
      throw new Error("couldn't read entire resource");
    }
  }
  return data;
};
