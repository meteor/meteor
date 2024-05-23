///
/// utility functions for files and directories. includes both generic
/// helper functions (such as rm_recursive), and meteor-specific ones
/// (such as testing whether an directory is a meteor app)
///

import fs, { PathLike, Stats, Dirent } from "fs";
import os from "os";
import { execFile } from "child_process";
import { EventEmitter } from "events";
import { Slot } from "@wry/context";
import { dep } from "optimism";

const _ = require('underscore');
const Fiber = require("fibers");

const rimraf = require('rimraf');
const sourcemap = require('source-map');
const sourceMapRetrieverStack = require('../tool-env/source-map-retriever-stack.js');

const utils = require('../utils/utils.js');
const cleanup = require('../tool-env/cleanup.js');
const buildmessage = require('../utils/buildmessage.js');
const fiberHelpers = require('../utils/fiber-helpers.js');
const colonConverter = require('../utils/colon-converter.js');

const Profile = require('../tool-env/profile').Profile;

export * from '../static-assets/server/mini-files';
import {
  convertToOSPath,
  convertToPosixPath,
  convertToStandardLineEndings,
  convertToStandardPath,
  convertToWindowsPath,
  isWindowsLikeFilesystem,
  pathBasename,
  pathDirname,
  pathJoin,
  pathNormalize,
  pathOsDelimiter,
  pathRelative,
  pathResolve,
  pathSep,
} from "../static-assets/server/mini-files";

const { hasOwnProperty } = Object.prototype;

const parsedSourceMaps: Record<string, any> = {};
let nextStackFilenameCounter = 1;

// Use the source maps specified to runJavaScript
function useParsedSourceMap(pathForSourceMap: string) {
  // Check our fancy source map data structure, used for isopacks
  if (hasOwnProperty.call(parsedSourceMaps, pathForSourceMap)) {
    return {map: parsedSourceMaps[pathForSourceMap]};
  }

  return null;
}

// Try this source map first
sourceMapRetrieverStack.push(useParsedSourceMap);

function canYield() {
  return Fiber.current &&
    Fiber.yield &&
    ! Fiber.yield.disallowed;
}

// given a predicate function and a starting path, traverse upwards
// from the path until we find a path that satisfies the predicate.
//
// returns either the path to the lowest level directory that passed
// the test or null for none found. if starting path isn't given, use
// cwd.
function findUpwards(
  predicate: (path: string) => boolean,
  startPath: string = cwd(),
): string | null {
  let testDir: string | null = startPath;
  while (testDir) {
    if (predicate(testDir)) {
      break;
    }
    var newDir: string = pathDirname(testDir);
    if (newDir === testDir) {
      testDir = null;
    } else {
      testDir = newDir;
    }
  }
  return testDir || null;
}

export function cwd() {
  return convertToStandardPath(process.cwd());
}

// Determine if 'filepath' (a path, or omit for cwd) is within an app
// directory. If so, return the top-level app directory.
export function findAppDir(filepath: string) {
  return findUpwards(function isAppDir(filepath) {
    // XXX once we are done with the transition to engine, this should
    // change to: `return exists(path.join(filepath, '.meteor',
    // 'release'))`

    // .meteor/packages can be a directory, if .meteor is a warehouse
    // directory.  since installing meteor initializes a warehouse at
    // $HOME/.meteor, we want to make sure your home directory (and all
    // subdirectories therein) don't count as being within a meteor app.
    try { // use try/catch to avoid the additional syscall to exists
      return stat(
        pathJoin(filepath, '.meteor', 'packages')).isFile();
    } catch (e) {
      return false;
    }
  }, filepath);
}

export function findPackageDir(filepath: string) {
  return findUpwards(function isPackageDir(filepath) {
    try {
      return stat(pathJoin(filepath, 'package.js')).isFile();
    } catch (e) {
      return false;
    }
  }, filepath);
}

// Returns the hash of the current Git HEAD revision of the application,
// if possible. Always resolves rather than rejecting (unless something
// truly unexpected happens). The result value is a string when a Git
// revision was successfully resolved, or undefined otherwise.
export function findGitCommitHash(path: string) {
  return new Promise<string|void>(resolve => {
    const appDir = findAppDir(path);
    if (appDir) {
      execFile("git", ["rev-parse", "HEAD"], {
        cwd: convertToOSPath(appDir),
      }, (error: any, stdout: string) => {
        if (! error && typeof stdout === "string") {
          resolve(stdout.trim());
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  }).await();
}

// create a .gitignore file in dirPath if one doesn't exist. add
// 'entry' to the .gitignore on its own line at the bottom of the
// file, if the exact line does not already exist in the file.
export function addToGitignore(dirPath: string, entry: string) {
  const filePath = pathJoin(dirPath, ".gitignore");
  if (exists(filePath)) {
    let data = readFile(filePath, 'utf8') as string;
    const lines = data.split(/\n/);
    if (lines.some(line => line === entry)) {
      // already there do nothing
    } else {
      // rewrite file w/ new entry.
      if (data.substr(-1) !== "\n") {
        data = data + "\n";
      }
      data = data + entry + "\n";
      writeFile(filePath, data, 'utf8');
    }
  } else {
    // doesn't exist, just write it.
    writeFile(filePath, entry + "\n", 'utf8');
  }
}

// Are we running Meteor from a git checkout?
export const inCheckout = _.once(function () {
  try {
    if (exists(pathJoin(getCurrentToolsDir(), '.git'))) {
      return true;
    }
  } catch (e) { console.log(e); }

  return false;
});

// True if we are using a warehouse: either installed Meteor, or if
// $METEOR_WAREHOUSE_DIR is set. Otherwise false (we're in a git checkout and
// just using packages from the checkout).
export function usesWarehouse() {
  // Test hook: act like we're "installed" using a non-homedir warehouse
  // directory.
  if (process.env.METEOR_WAREHOUSE_DIR) {
    return true;
  } else {
    return ! inCheckout();
  }
}

// Read the '.tools_version.txt' file. If in a checkout, throw an error.
export function getToolsVersion() {
  if (! inCheckout()) {
    const isopackJsonPath = pathJoin(getCurrentToolsDir(),
      '..',  // get out of tool, back to package
      'isopack.json');

    let parsed;

    if (exists(isopackJsonPath)) {
      // XXX "isopack-1" is duplicate of isopack.currentFormat
      parsed = JSON.parse(readFile(isopackJsonPath))["isopack-1"];
      return parsed.name + '@' + parsed.version;
    }

    // XXX COMPAT WITH 0.9.3
    const unipackageJsonPath = pathJoin(
      getCurrentToolsDir(),
      '..',  // get out of tool, back to package
      'unipackage.json'
    );
    parsed = JSON.parse(readFile(unipackageJsonPath));
    return parsed.name + '@' + parsed.version;
  } else {
    throw new Error("Unexpected. Git checkouts don't have tools versions.");
  }
}

// Return the root of dev_bundle (probably /usr/local/meteor in an
// install, or (checkout root)/dev_bundle in a checkout.).
export function getDevBundle() {
  return pathJoin(getCurrentToolsDir(), 'dev_bundle');
}

export function getCurrentNodeBinDir() {
  return pathJoin(getDevBundle(), "bin");
}

// Return the top-level directory for this meteor install or checkout
export function getCurrentToolsDir() {
  return pathDirname(pathDirname(convertToStandardPath(__dirname)));
}

// Read a settings file and sanity-check it. Returns a string on
// success or null on failure (in which case buildmessages will be
// emitted).
export function getSettings(
  filename: string,
  watchSet: import("./watch").WatchSet,
) {
  buildmessage.assertInCapture();
  const absPath = pathResolve(filename);
  const buffer = require("./watch").readAndWatchFile(watchSet, absPath);
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

  let str = buffer.toString('utf8');

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
}

// Returns true if the first path is a parent of the second path
export function containsPath(path1: string, path2: string) {
  const relPath = pathRelative(path1, path2);

  // On Windows, if the two paths are on different drives the relative
  // path starts with /
  return !(relPath.startsWith("..") || relPath.startsWith("/"));
}

// Try to find the prettiest way to present a path to the
// user. Presently, the main thing it does is replace $HOME with ~.
export function prettyPath(p: string) {
  p = realpath(p);
  const home = getHomeDir();
  if (! home) {
    return p;
  }
  const relativeToHome = pathRelative(home, p);
  if (relativeToHome.substr(0, 3) === ('..' + pathSep)) {
    return p;
  }
  return pathJoin('~', relativeToHome);
}

// Like statSync, but null if file not found
export function statOrNull(path: string) {
  return statOrNullHelper(path, false);
}

function statOrNullHelper(path: string, preserveSymlinks = false) {
  try {
    return preserveSymlinks
      ? lstat(path)
      : stat(path);
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return null;
    }
    throw e;
  }
}

export function realpathOrNull(path: string) {
  try {
    return realpath(path);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
    return null;
  }
}

export function rm_recursive_async(path: string) {
  return new Promise<void>((resolve, reject) => {
    rimraf(convertToOSPath(path), (err: Error) => err
      ? reject(err)
      : resolve());
  });
}

// Like rm -r.
export const rm_recursive = Profile("files.rm_recursive", (path: string) => {
  try {
    rimraf.sync(convertToOSPath(path));
  } catch (e: any) {
    if ((e.code === "ENOTEMPTY" ||
         e.code === "EPERM") &&
        canYield()) {
      rm_recursive_async(path).await();
      return;
    }
    throw e;
  }
});

// Returns the base64 SHA256 of the given file.
export function fileHash(filename: string) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.setEncoding('base64');
  const rs = createReadStream(filename);
  return new Promise(function (resolve) {
    rs.on('end', function () {
      rs.close();
      resolve(hash.digest('base64'));
    });
    rs.pipe(hash, { end: false });
  }).await();
}

// This is the result of running fileHash on a blank file.
export const blankHash = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";

// Returns a base64 SHA256 hash representing a tree on disk. It is not sensitive
// to modtime, uid/gid, or any permissions bits other than the current-user-exec
// bit on normal files.
export function treeHash(root: string, optionsParams: {
  ignore?: (path: string) => boolean;
}) {
  const options = {
    ignore() { return false; },
    ...optionsParams,
  };

  const hash = require('crypto').createHash('sha256');

  function traverse(relativePath: string) {
    if (options.ignore(relativePath)) {
      return;
    }

    var absPath = pathJoin(root, relativePath);
    var stat = lstat(absPath);

    if (stat?.isDirectory()) {
      if (relativePath) {
        hash.update('dir ' + JSON.stringify(relativePath) + '\n');
      }
      readdir(absPath).forEach(entry => {
        traverse(pathJoin(relativePath, entry));
      });
    } else if (stat?.isFile()) {
      if (!relativePath) {
        throw Error("must call files.treeHash on a directory");
      }
      hash.update('file ' + JSON.stringify(relativePath) + ' ' +
                  stat?.size + ' ' + fileHash(absPath) + '\n');

      // @ts-ignore
      if (stat.mode & 0o100) {
        hash.update('exec\n');
      }
    } else if (stat?.isSymbolicLink()) {
      if (!relativePath) {
        throw Error("must call files.treeHash on a directory");
      }
      hash.update('symlink ' + JSON.stringify(relativePath) + ' ' +
                  JSON.stringify(readlink(absPath)) + '\n');
    }
    // ignore anything weirder
  }

  traverse('');

  return hash.digest('base64');
}

// like mkdir -p. if it returns true, the item is a directory (even if
// it was already created). if it returns false, the item is not a
// directory and we couldn't make it one.
export function mkdir_p(dir: string, mode: number | null = null) {
  const p = pathResolve(dir);
  const ps = pathNormalize(p).split(pathSep);

  const stat = statOrNull(p);
  if (stat) {
    return stat.isDirectory();
  }

  // doesn't exist. recurse to build parent.
  // Don't use pathJoin here because it can strip off the leading slash
  // accidentally.
  const parentPath = ps.slice(0, -1).join(pathSep);
  const success = mkdir_p(parentPath, mode);
  // parent is not a directory.
  if (! success) { return false; }

  try {
    mkdir(p, mode);
  } catch (err: any) {
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
}

function pathIsDirectory(path: string) {
  const stat = statOrNull(path);
  return stat && stat.isDirectory();
}

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
export function cp_r(from: string, to: string, options: {
  preserveSymlinks?: boolean;
  ignore?: RegExp[];
  transformFilename?: (f: string) => string;
  transformContents?: (
    contents: ReturnType<typeof readFile>,
    file: string,
  ) => typeof contents;
} = {}) {
  from = pathResolve(from);

  const stat = statOrNullHelper(from, options.preserveSymlinks);
  if (! stat) {
    return;
  }

  if (stat.isDirectory()) {
    mkdir_p(to, 0o755);

    readdir(from).forEach(f => {
      if (options.ignore &&
          options.ignore.some(pattern => f.match(pattern))) {
        return;
      }

      const fullFrom = pathJoin(from, f);

      if (options.transformFilename) {
        f = options.transformFilename(f);
      }

      cp_r(
        fullFrom,
        pathJoin(to, f),
        options
      );
    })

    return;
  }

  mkdir_p(pathDirname(to));

  if (stat.isSymbolicLink()) {
    symlinkWithOverwrite(readlink(from), to);

  } else if (options.transformContents) {
    writeFile(to, options.transformContents(
      readFile(from),
      pathBasename(from)
    ), {
      // Create the file as readable and writable by everyone, and
      // executable by everyone if the original file is executable by
      // owner. (This mode will be modified by umask.) We don't copy the
      // mode *directly* because this function is used by 'meteor create'
      // which is copying from the read-only tools tree into a writable app.

      // @ts-ignore
      mode: (stat.mode & 0o100) ? 0o777 : 0o666,
    });

  } else {
    // Note: files.copyFile applies the same stat.mode logic as above.
    copyFile(from, to);
  }
}

// create a symlink, overwriting the target link, file, or directory
// if it exists
export const symlinkWithOverwrite =
Profile("files.symlinkWithOverwrite", function symlinkWithOverwrite(
  source: string,
  target: string,
) {
  const args: [string, string, "junction"?] = [source, target];

  if (process.platform === "win32") {
    const absoluteSource = pathResolve(target, source);

    if (stat(absoluteSource).isDirectory()) {
      args[2] = "junction";
    }
  }

  try {
    symlink(...args);
  } catch (e: any) {
    if (e.code === "EEXIST") {
      function normalizePath(path: string) {
        return convertToOSPath(path).replace(/[\/\\]$/, "")
      }

      if (lstat(target)?.isSymbolicLink() &&
          normalizePath(readlink(target)) === normalizePath(source)) {
        // If the target already points to the desired source, we don't
        // need to do anything.
        return;
      }
      // overwrite existing link, file, or directory
      rm_recursive(target);
      symlink(...args);
    } else {
      throw e;
    }
  }
})

/**
 * Get every path in a directory recursively, treating symlinks as files
 * @param  {String} dir     The directory to walk, either relative to options.cwd or completely absolute
 * @param  {Object} options Some options
 * @param {String} options.cwd The directory that paths should be relative to
 * @param {String[]} options.output An array to push results to
 * @return {String[]}         All of the paths in the directory recursively
 */
export function getPathsInDir(dir: string, options: {
  cwd?: string;
  output?: string[];
}) {
  // Don't let this function yield so that the file system doesn't get changed
  // underneath us
  return fiberHelpers.noYieldsAllowed(function () {
    var cwd = options.cwd || convertToStandardPath(process.cwd());

    if (! exists(cwd)) {
      throw new Error("Specified current working directory doesn't exist: " +
        cwd);
    }

    const absoluteDir = pathResolve(cwd, dir);

    if (! exists(absoluteDir)) {
      // There are no paths in this dir, so don't do anything
      return;
    }

    const output = options.output || [];

    function pathIsDirectory(path: string) {
      var stat = lstat(path);
      return stat?.isDirectory() || false;
    }

    readdir(absoluteDir).forEach(entry => {
      const newPath = pathJoin(dir, entry);
      const newAbsPath = pathJoin(absoluteDir, entry);

      output.push(newPath);

      if (pathIsDirectory(newAbsPath)) {
        getPathsInDir(newPath, {
          cwd: cwd,
          output: output
        });
      }
    });

    return output;
  });
}

export function findPathsWithRegex(
  dir: string,
  regex: RegExp,
  options: {
    cwd: string;
  },
) {
  return getPathsInDir(dir, {
    cwd: options.cwd
  }).filter(function (path: string) {
    return path.match(regex);
  });
}

// Make a temporary directory. Returns the path to the newly created
// directory. Only the current user is allowed to read or write the
// files in the directory (or add files to it). The directory will
// be cleaned up on exit.
const tempDirs = Object.create(null);
export function mkdtemp(prefix: string): string {
  function make(): string {
    prefix = prefix || 'mt-';
    // find /tmp
    let tmpDir: string | undefined;
    ['TMPDIR', 'TMP', 'TEMP'].some(t => {
      const value = process.env[t];
      if (value) {
        tmpDir = value;
        return true;
      }
    });

    if (! tmpDir && process.platform !== 'win32') {
      tmpDir = '/tmp';
    }

    if (! tmpDir) {
      throw new Error("Couldn't create a temporary directory.");
    }

    tmpDir = realpath(tmpDir);

    // make the directory. give it 3 tries in case of collisions from
    // crappy random.
    var tries = 3;
    while (tries > 0) {
      const dirPath = pathJoin(
        tmpDir,
        prefix + (Math.random() * 0x100000000 + 1).toString(36),
      );
      try {
        mkdir(dirPath, 0o700);
        return dirPath;
      } catch (err) {
        tries--;
      }
    }
    throw new Error("failed to make temporary directory in " + tmpDir);
  };
  const dir = make();
  tempDirs[dir] = true;
  return dir;
}

// Call this if you're done using a temporary directory. It will asynchronously
// be deleted.
export function freeTempDir(dir: string) {
  if (! tempDirs[dir]) {
    throw Error("not a tracked temp dir: " + dir);
  }

  if (process.env.METEOR_SAVE_TMPDIRS) {
    return;
  }

  return rm_recursive_async(dir).then(() => {
    // Delete tempDirs[dir] only when the removal finishes, so that the
    // cleanup.onExit handler can attempt the removal synchronously if it
    // fires in the meantime.
    delete tempDirs[dir];
  }, error => {
    // Leave tempDirs[dir] in place so the cleanup.onExit handler can try
    // to delete it again when the process exits.
    console.log(error);
  });
}

// Change the status of a dir
export function changeTempDirStatus(dir: string, status: boolean) {
  if (! tempDirs[dir]) {
    throw Error("not a tracked temp dir: " + dir);
  }

  tempDirs[dir] = status;
}

if (! process.env.METEOR_SAVE_TMPDIRS) {
  cleanup.onExit(function () {
    Object.entries(tempDirs).filter(([_, isTmp]) => !!isTmp).map(([dir]) => dir).forEach(dir => {
      delete tempDirs[dir];
      try {
        rm_recursive(dir);
      } catch (err) {
        // Don't crash and print a stack trace because we failed to delete
        // a temp directory. This happens sometimes on Windows and seems
        // to be unavoidable.
      }
    });
  });
}

type TarOptions = {
  verbose?: boolean;
  forceConvert?: boolean;
}

// Takes a buffer containing `.tar.gz` data and extracts the archive
// into a destination directory. destPath should not exist yet, and
// the archive should contain a single top-level directory, which will
// be renamed atomically to destPath.
export function extractTarGz(
  buffer: Buffer,
  destPath: string,
  options: TarOptions = {},
) {
  const parentDir = pathDirname(destPath);
  const tempDir = pathJoin(parentDir, '.tmp' + utils.randomToken());
  mkdir_p(tempDir);

  if (! hasOwnProperty.call(options, "verbose")) {
    options.verbose = require("../console/console.js").Console.verbose;
  }

  const startTime = +new Date;

  // standardize only one way of extracting, as native ones can be tricky
  const promise = tryExtractWithNpmTar(buffer, tempDir, options)

  promise.await();

  // succeed!
  const topLevelOfArchive = readdir(tempDir)
    // On Windows, the 7z.exe tool sometimes creates an auxiliary
    // PaxHeader directory.
    .filter(file => ! file.startsWith("PaxHeader"));

  if (topLevelOfArchive.length !== 1) {
    throw new Error(
      "Extracted archive '" + tempDir + "' should only contain one entry");
  }

  const extractDir = pathJoin(tempDir, topLevelOfArchive[0]);
  rename(extractDir, destPath);
  rm_recursive(tempDir);

  if (options.verbose) {
    console.log("Finished extracting in", Date.now() - startTime, "ms");
  }
}

function ensureDirectoryEmpty(dir: string) {
  readdir(dir).forEach(file => {
    rm_recursive(pathJoin(dir, file));
  });
}

function tryExtractWithNpmTar(
  buffer: Buffer,
  tempDir: string,
  options: TarOptions = {},
) {
  ensureDirectoryEmpty(tempDir);

  const tar = require("tar-fs");
  const zlib = require("zlib");

  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip().on('error', reject);
    const extractor = tar.extract(convertToOSPath(tempDir), {
      /* the following lines guarantees that archives created on windows
      are going to be readable and writable on unixes */
      readable: true, // all dirs and files should be readable
      writable: true, // all dirs and files should be writable
      map: function(header: any) {
        if (process.platform === "win32" || options.forceConvert) {
          // On Windows, try to convert old packages that have colons in
          // paths by blindly replacing all of the paths. Otherwise, we
          // can't even extract the tarball
          header.name = colonConverter.convert(header.name);
        }
        return header
      }
    }).on('error', reject)
      .on('finish', resolve);

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
function addExecBitWhenReadBitPresent(fileMode: number) {
  return fileMode |= (fileMode >>> 2) & 0o111;
}

// Tar-gzips a directory, returning a stream that can then be piped as
// needed.  The tar archive will contain a top-level directory named
// after dirPath.
export function createTarGzStream(dirPath: string) {
  const tar = require("tar-fs");
  const zlib = require("zlib");
  const basename = pathBasename(dirPath);

  // Create a segment of the file path which we will look for to
  // identify exactly what we think is a "bin" file (that is, something
  // which should be expected to work within the context of an
  // 'npm run-script').
  // tar-fs doesn't use native paths in the header, so we are joining with a slash
  const binPathMatch = ["", "node_modules", ".bin", ""].join('/');
  const tarStream = tar.pack(convertToOSPath(dirPath), {
    map: (header: any) => {
      header.name = `${basename}/${header.name}`

      if (process.platform !== "win32") {
        return header;
      }

      if (header.type === "directory") {
        header.mode = addExecBitWhenReadBitPresent(header.mode);
      }

      if (header.type === "file" && header.name.includes(binPathMatch)) {
        header.mode = addExecBitWhenReadBitPresent(header.mode);
      }
      return header
    },
    readable: true, // all dirs and files should be readable
    writable: true, // all dirs and files should be writable
  });

  return tarStream.pipe(zlib.createGzip());
}

// Tar-gzips a directory into a tarball on disk, synchronously.
// The tar archive will contain a top-level directory named after dirPath.
export const createTarball = Profile(function (_: string, tarball: string) {
  return "files.createTarball " + pathBasename(tarball);
}, function (dirPath: string, tarball: string) {
  const out = createWriteStream(tarball);
  new Promise(function (resolve, reject) {
    out.on('error', reject);
    out.on('close', resolve);
    createTarGzStream(dirPath).pipe(out);
  }).await();
});

// Use this if you'd like to replace a directory with another
// directory as close to atomically as possible. It's better than
// recursively deleting the target directory first and then
// renaming. (Failure modes here include "there's a brief moment where
// toDir does not exist" and "you can end up with garbage directories
// sitting around", but not "there's any time where toDir exists but
// is in a state other than initial or final".)
export const renameDirAlmostAtomically =
Profile("files.renameDirAlmostAtomically", (fromDir: string, toDir: string) => {
  const garbageDir = pathJoin(
    pathDirname(toDir),
    // Begin the base filename with a '.' character so that it can be
    // ignored by other directory-scanning code.
    `.${pathBasename(toDir)}-garbage-${utils.randomToken()}`,
  );

  // Get old dir out of the way, if it exists.
  let cleanupGarbage = false;
  let forceCopy = false;
  try {
    rename(toDir, garbageDir);
    cleanupGarbage = true;
  } catch (e: any) {
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
      rename(fromDir, toDir);
    } catch (e: any) {
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
    rm_recursive(toDir);
    cp_r(fromDir, toDir, {
      preserveSymlinks: true,
    });
  }

  // ... and take out the trash.
  if (cleanupGarbage) {
    // We don't care about how long this takes, so we'll let it go async.
    rm_recursive_async(garbageDir);
  }
});

export const writeFileAtomically =
Profile("files.writeFileAtomically", function (filename: string, contents: string | Buffer) {
  const parentDir = pathDirname(filename);
  mkdir_p(parentDir);

  const tmpFile = pathJoin(
    parentDir,
    '.' + pathBasename(filename) + '.' + utils.randomToken()
  );

  writeFile(tmpFile, contents);
  rename(tmpFile, filename);
});

// Like fs.symlinkSync, but creates a temporary link and renames it over the
// file; this means it works even if the file already exists.
// Do not use this function on Windows, it won't work.
export function symlinkOverSync(linkText: string, file: string) {
  file = pathResolve(file);
  const tmpSymlink = pathJoin(
    pathDirname(file),
    "." + pathBasename(file) + ".tmp" + utils.randomToken());
  symlink(linkText, tmpSymlink);
  rename(tmpSymlink, file);
}

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
// an undocumented flag. Unfortunately though node doesn't have dup2 so
// we can't intercept the write. So instead we use a completely
// different parser with a better error handling API. Ah well.  The
// underlying V8 issue is:
//   https://code.google.com/p/v8/issues/detail?id=1281
export function runJavaScript(code: string, {
  symbols = Object.create(null),
  filename = "<anonymous>",
  sourceMap,
  sourceMapRoot,
}: {
  symbols: Record<string, any>;
  filename: string;
  sourceMap?: object;
  sourceMapRoot?: string;
}) {
  return Profile.time('runJavaScript ' + filename, () => {
    const keys: string[] = [], values: any[] = [];
    // don't assume that _.keys and _.values are guaranteed to
    // enumerate in the same order
    _.each(symbols, function (value: any, name: string) {
      keys.push(name);
      values.push(value);
    });

    let stackFilename = filename;
    if (sourceMap) {
      // We want to generate an arbitrary filename that we use to associate the
      // file with its source map.
      stackFilename = "<runJavaScript-" + nextStackFilenameCounter++ + ">";
    }

    const chunks = [];
    const header = "(function(" + keys.join(',') + "){";
    chunks.push(header);
    if (sourceMap) {
      const sourcemapConsumer = Promise.await(new sourcemap.SourceMapConsumer(sourceMap));
      chunks.push(sourcemap.SourceNode.fromStringWithSourceMap(
        code, sourcemapConsumer));
      sourcemapConsumer.destroy();
    } else {
      chunks.push(code);
    }
    // \n is necessary in case final line is a //-comment
    chunks.push("\n})");

    let wrapped;
    let parsedSourceMap = null;
    if (sourceMap) {
      const results = new sourcemap.SourceNode(
        null, null, null, chunks
      ).toStringWithSourceMap({
        file: stackFilename
      });
      wrapped = results.code;
      parsedSourceMap = results.map.toJSON();
      if (sourceMapRoot) {
        // Add the specified root to any root that may be in the file.
        parsedSourceMap.sourceRoot = pathJoin(
          sourceMapRoot, parsedSourceMap.sourceRoot || '');
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
    } catch (nodeParseError: any) {
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
      const { parse } = require('@meteorjs/babel');
      try {
        parse(wrapped, { strictMode: false });
      } catch (parseError: any) {
        if (typeof parseError.loc !== "object") {
          throw parseError;
        }

        const err = new FancySyntaxError;
        err.message = parseError.message;

        if (parsedSourceMap) {
          // XXX this duplicates code in computeGlobalReferences
          var consumer2 = Promise.await(new sourcemap.SourceMapConsumer(parsedSourceMap));
          var original = consumer2.originalPositionFor(parseError.loc);
          consumer2.destroy();
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
        if (err.line === 1 && typeof err.column === "number") {
          err.column -= header.length;
        }

        throw err;
      }

      // What? Node thought that this was a parse error and Babel didn't?
      // Eh, just throw Node's error and don't care too much about the line
      // numbers being right.
      throw nodeParseError;
    }

    return buildmessage.markBoundary(
      script.runInThisContext()
    ).apply(null, values);
  });
}

// - message: an error message from the parser
// - file: filename
// - line: 1-based
// - column: 1-based
export class FancySyntaxError {
  public file?: string;
  public line?: number;
  public column?: number;
  constructor(public message?: string) {}
}

export class OfflineError {
  constructor(public error: Error) {}
  toString() {
    return "[Offline: " + this.error.toString() + "]";
  }
}

// Like files.readdir, but skips entries whose names begin with dots, and
// converts ENOENT to [].
export function readdirNoDots(path: string) {
  try {
    var entries = readdir(path);
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return [];
    }
    throw e;
  }
  return entries.filter(entry => {
    return entry && entry[0] !== '.';
  });
}

// Read a file in line by line. Returns an array of lines to be
// processed individually. Throws if the file doesn't exist or if
// anything else goes wrong.
export function getLines(file: string) {
  var buffer = readFile(file);
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
}

export function splitBufferToLines(buffer: Buffer) {
  return buffer.toString('utf8').split(/\r*\n\r*/);
}

// Same as `getLines`, but returns [] if the file doesn't exist.
export function getLinesOrEmpty(file: string) {
  try {
    return getLines(file);
  } catch (e: any) {
    if (e && e.code === 'ENOENT') {
      return [];
    }
    throw e;
  }
}

// Returns null if the file does not exist, otherwise returns the parsed JSON in
// the file. Throws on errors other than ENOENT (including JSON parse failure).
export function readJSONOrNull(file: string) {
  try {
    var raw = readFile(file, 'utf8');
  } catch (e: any) {
    if (e && e.code === 'ENOENT') {
      return null;
    }
    throw e;
  }
  return JSON.parse(raw);
}

// Trims whitespace & other filler characters of a line in a project file.
export function trimSpaceAndComments(line: string) {
  var match = line.match(/^([^#]*)#/);
  if (match) {
    line = match[1];
  }
  return trimSpace(line);
}

// Trims leading and trailing whilespace in a project file.
export function trimSpace(line: string) {
  return line.replace(/^\s+|\s+$/g, '');
}

export class KeyValueFile {
  constructor(public path: string) {}

  set(k: string, v: any) {
    const data = (this.readAll() || '').toString("utf8");
    const lines = data.split(/\n/);

    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.indexOf(k + '=') == 0) {
        lines[i] = k + '=' + v;
        found = true;
      }
    }
    if (!found) {
      lines.push(k + "=" + v);
    }
    const newdata = lines.join('\n') + '\n';
    writeFile(this.path, newdata, 'utf8');
  }

  private readAll() {
    if (exists(this.path)) {
      return readFile(this.path, 'utf8');
    } else {
      return null;
    }
  }
}

export function getHomeDir() {
  if (process.platform === "win32") {
    const MI = process.env.METEOR_INSTALLATION;
    if (typeof MI === "string") {
      return pathDirname(convertToStandardPath(MI));
    }
  }
  return process.env.HOME;
}

export function currentEnvWithPathsAdded(...paths: string[]) {
  const env = {...process.env};

  let pathPropertyName;
  if (process.platform === "win32") {
    // process.env allows for case insensitive access on Windows, but copying it
    // creates a normal JavaScript object with case sensitive property access.
    // This leads to problems, because we would be adding a PATH property instead
    // of setting Path for instance.
    // We want to make sure we're setting the right property, so we
    // lookup the property name case insensitively ourselves.
    pathPropertyName = _.find(Object.keys(env), (key: string) => {
      return key.toUpperCase() === 'PATH';
    });
    if (!pathPropertyName) {
      pathPropertyName = 'Path';
    }
  } else {
    pathPropertyName = 'PATH';
  }

  const convertedPaths = paths.map(path => convertToOSPath(path));
  let pathDecomposed = (env[pathPropertyName] || "").split(pathOsDelimiter);
  pathDecomposed.unshift(...convertedPaths);

  env[pathPropertyName] = pathDecomposed.join(pathOsDelimiter);
  return env;
}

// add .bat extension to link file if not present
function ensureBatExtension(p: string) {
  return p.endsWith(".bat") ? p : p + ".bat";
}

// Windows-only, generates a bat script that calls the destination bat script
export function _generateScriptLinkToMeteorScript(scriptLocation: string) {
  const scriptLocationIsAbsolutePath = scriptLocation.match(/^\//);
  const scriptLocationConverted = scriptLocationIsAbsolutePath
    ? convertToWindowsPath(scriptLocation)
    : "%~dp0\\" + convertToWindowsPath(scriptLocation);

  return [
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
}

export function _getLocationFromScriptLinkToMeteorScript(script: string | Buffer) {
  const lines = _.compact(script.toString().split('\n'));

  let scriptLocation = _.last(lines).replace(/^rem /g, '');
  let isAbsolute = true;

  if (scriptLocation.match(/^%~dp0/)) {
    isAbsolute = false;
    scriptLocation = scriptLocation.replace(/^%~dp0\\?/g, '');
  }

  if (! scriptLocation) {
    throw new Error('Failed to parse script location from meteor.bat');
  }

  return convertToPosixPath(scriptLocation, ! isAbsolute);
}

export function linkToMeteorScript(
  scriptLocation: string,
  linkLocation: string,
  platform: string,
) {
  platform = platform || process.platform;

  if (platform === 'win32') {
    // Make a meteor batch script that points to current tool
    linkLocation = ensureBatExtension(linkLocation);
    scriptLocation = ensureBatExtension(scriptLocation);
    const script = _generateScriptLinkToMeteorScript(scriptLocation);
    writeFile(linkLocation, script, { encoding: "ascii" });
  } else {
    // Symlink meteor tool
    symlinkOverSync(scriptLocation, linkLocation);
  }
}

export function readLinkToMeteorScript(
  linkLocation: string,
  platform = process.platform,
) {
  if (platform === 'win32') {
    linkLocation = ensureBatExtension(linkLocation);
    const script = readFile(linkLocation);
    return _getLocationFromScriptLinkToMeteorScript(script);
  } else {
    return readlink(linkLocation);
  }
}

// The fs.exists method is deprecated in Node v4:
// https://nodejs.org/api/fs.html#fs_fs_exists_path_callback
export function exists(path: string) {
  return !! statOrNull(path);
}

export function readBufferWithLengthAndOffset(
  filename: string,
  length: number,
  offset: number,
) {
  const data = Buffer.alloc(length);
  // Read the data from disk, if it is non-empty. Avoid doing IO for empty
  // files, because (a) unnecessary and (b) fs.readSync with length 0
  // throws instead of acting like POSIX read:
  // https://github.com/joyent/node/issues/5685
  if (length > 0) {
    const fd = open(filename, "r");
    try {
      const count = read(fd, data, { position: 0, length, offset });
      if (count !== length) {
        throw new Error("couldn't read entire resource");
      }
    } catch (err: any) {
      err.message = `Error while reading ${filename}: ` + err.message;
      throw err;
    } finally {
      close(fd);
    }
  }
  return data;
}

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

type wrapFsFuncOptions<TArgs extends any[], TResult> = {
  cached?: boolean;
  modifyReturnValue?: (result: TResult) => any;
  dirty?: (...args: TArgs) => any;
}

function wrapFsFunc<TArgs extends any[], TResult>(
  fnName: string,
  fn: (...args: TArgs) => TResult,
  pathArgIndices: number[],
  options?: wrapFsFuncOptions<TArgs, TResult>,
): typeof fn {
  return Profile("files." + fnName, function (...args: TArgs) {
    for (let j = pathArgIndices.length - 1; j >= 0; --j) {
      const i = pathArgIndices[j];
      args[i] = convertToOSPath(args[i]);
    }

    let cacheKey: string | null = null;
    if (options && options.cached) {
      const cache = withCacheSlot.getValue();
      if (cache) {
        const strings = [fnName];
        const allStrings = args.every(arg => {
          if (typeof arg === "string") {
            strings.push(arg);
            return true;
          }
          return false;
        });
        if (allStrings) {
          cacheKey = JSON.stringify(strings);
          if (hasOwnProperty.call(cache, cacheKey)) {
            return cache[cacheKey];
          }
        }
      }
    }

    const result = fn.apply(fs, args);

    if (options && options.dirty) {
      options.dirty(...args);
    }

    const finalResult = options && options.modifyReturnValue
      ? options.modifyReturnValue(result)
      : result;

    if (cacheKey) {
      withCacheSlot.getValue()![cacheKey] = finalResult;
    }

    return finalResult;
  });
}

const withCacheSlot = new Slot<Record<string, any>>();
export function withCache<R>(fn: () => R): R {
  const cache = withCacheSlot.getValue();
  return cache ? fn() : withCacheSlot.withValue(Object.create(null), fn);
}

export const dependOnPath = dep<string>();

function wrapDestructiveFsFunc<TArgs extends any[], TResult>(
  fnName: string,
  fn: (...args: TArgs) => TResult,
  pathArgIndices: number[] = [0],
  options?: wrapFsFuncOptions<TArgs, TResult>,
): typeof fn {
  return wrapFsFunc<TArgs, TResult>(fnName, fn, pathArgIndices, {
    ...options,
    dirty(...args: TArgs) {
      pathArgIndices.forEach(i => dependOnPath.dirty(args[i]));
    }
  });
}

export const readFile = wrapFsFunc("readFile", fs.readFileSync, [0], {
  modifyReturnValue: function (fileData: Buffer | string) {
    if (typeof fileData === "string") {
      return convertToStandardLineEndings(fileData);
    }
    return fileData;
  }
});

// Copies a file, which is expected to exist. Parent directories of "to" do not
// have to exist. Treats symbolic links transparently (copies the contents, not
// the link itself, and it's an error if the link doesn't point to a file).
const wrappedCopyFile = wrapDestructiveFsFunc("copyFile", fs.copyFileSync, [0, 1]);
export function copyFile(from: string, to: string, flags = 0) {
  mkdir_p(pathDirname(pathResolve(to)), 0o755);
  wrappedCopyFile(from, to, flags);
  const stat = statOrNull(from);
  if (stat && stat.isFile()) {
    // Create the file as readable and writable by everyone, and executable by
    // everyone if the original file is executably by owner. (This mode will be
    // modified by umask.) We don't copy the mode *directly* because this function
    // is used by 'meteor create' which is copying from the read-only tools tree
    // into a writable app.

    // @ts-ignore
    chmod(to, (stat.mode & 0o100) ? 0o777 : 0o666);
  }
}

const wrappedRename = wrapDestructiveFsFunc("rename", fs.renameSync, [0, 1]);
export const rename = isWindowsLikeFilesystem() ? function (from: string, to: string) {
  // Retries are necessary only on Windows, because the rename call can
  // fail with EBUSY, which means the file is in use.
  const osTo = convertToOSPath(to);
  const startTimeMs = Date.now();
  const intervalMs = 50;
  const timeLimitMs = 1000;

  return new Promise<void>((resolve, reject) => {
    function attempt() {
      try {
        // Despite previous failures, the top-level destination directory
        // may have been successfully created, so we must remove it to
        // avoid moving the source file *into* the destination directory.
        rimraf.sync(osTo);
        wrappedRename(from, to);
        resolve();
      } catch (err: any) {
        if (err.code !== 'EPERM' && err.code !== 'EACCES') {
          reject(err);
        } else if (Date.now() - startTimeMs < timeLimitMs) {
          setTimeout(attempt, intervalMs);
        } else {
          reject(err);
        }
      }
    }
    attempt();
  }).catch((error: any) => {
    if (error.code === 'EPERM' ||
        error.code === 'EACCES') {
      cp_r(from, to, { preserveSymlinks: true });
      rm_recursive(from);
    } else {
      throw error;
    }
  }).await();
} : wrappedRename;

// Warning: doesn't convert slashes in the second 'cache' arg
export const realpath =
wrapFsFunc<[string], string>("realpath", fs.realpathSync, [0], {
  cached: true,
  modifyReturnValue: convertToStandardPath,
});

export const readdir =
wrapFsFunc<[string], string[]>("readdir", fs.readdirSync, [0], {
  cached: true,
  modifyReturnValue(entries: string[]) {
    return entries.map(entry => convertToStandardPath(entry));
  },
});

export const readdirWithTypes = wrapFsFunc<[string], Dirent[]>("readdirWithTypes", (dir) => {
    return fs.readdirSync(dir, {
      withFileTypes: true
    });
  }, [0], {
  cached: true
});

export const appendFile = wrapDestructiveFsFunc("appendFile", fs.appendFileSync);
export const chmod = wrapDestructiveFsFunc("chmod", fs.chmodSync);
export const close = wrapFsFunc("close", fs.closeSync, []);
export const createReadStream = wrapFsFunc("createReadStream", fs.createReadStream, [0]);
export const createWriteStream = wrapFsFunc("createWriteStream", fs.createWriteStream, [0]);
export const lstat = wrapFsFunc("lstat", fs.lstatSync, [0], { cached: true });
export const mkdir = wrapDestructiveFsFunc("mkdir", fs.mkdirSync);
export const open = wrapFsFunc("open", fs.openSync, [0]);
export const read = wrapFsFunc("read", fs.readSync, []);
export const readlink = wrapFsFunc<[string], string>("readlink", fs.readlinkSync, [0]);
export const rmdir = wrapDestructiveFsFunc("rmdir", fs.rmdirSync);
export const stat = wrapFsFunc("stat", fs.statSync as (path: PathLike) => Stats, [0], { cached: true });
export const symlink = wrapFsFunc("symlink", fs.symlinkSync, [0, 1]);
export const unlink = wrapDestructiveFsFunc("unlink", fs.unlinkSync);
export const write = wrapFsFunc("write", fs.writeSync, []);
export const writeFile = wrapDestructiveFsFunc("writeFile", fs.writeFileSync);

type StatListener = (
  current: Stats,
  previous: Stats,
) => void;

type StatWatcherOptions = {
  persistent?: boolean;
  interval?: number;
};

interface StatWatcher extends EventEmitter {
  stop: () => void;
  start: (
    filename: string,
    options: StatWatcherOptions,
    listener: StatListener,
  ) => void;
}

export const watchFile = wrapFsFunc("watchFile", (
  filename: string,
  options: StatWatcherOptions,
  listener: StatListener,
) => {
  return fs.watchFile(
    filename,
    options,
    listener,
  ) as any as StatWatcher;
}, [0]);

export const unwatchFile = wrapFsFunc("unwatchFile", (
  filename: string,
  listener?: StatListener,
) => {
  return fs.unwatchFile(filename, listener);
}, [0]);
