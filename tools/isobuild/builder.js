import {WatchSet, readAndWatchFile, sha1} from '../fs/watch.js';
import files from '../fs/files.js';
import NpmDiscards from './npm-discards.js';
import {Profile} from '../tool-env/profile.js';

// Builder has two modes of working:
// - write files to a temp directory and later atomically move it to destination
// - write files in-place replacing the older files
// The later doesn't work on Windows but works well on Mac OS X and Linux, since
// the file system allows writing new files to the path of a file opened by a
// process. The process only retains the inode, not the path.
const ENABLE_IN_PLACE_BUILDER_REPLACEMENT =
  (process.platform !== 'win32') &&
  ! process.env.METEOR_DISABLE_BUILDER_IN_PLACE;


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
// - previousBuilder: Optional. An in-memory instance of Builder left
// from the previous iteration. It is assumed that the previous builder
// has completed its job successfully and its files are stored on the
// file system in the exact layout as described in its usedAsFile data
// structure; and the hashes of the contents correspond to the
// writtenHashes data strcture.
export default class Builder {
  constructor({outputPath, previousBuilder}) {
    this.outputPath = outputPath;

    // Paths already written to. Map from canonicalized relPath (no
    // trailing slash) to true for a file, or false for a directory.
    this.usedAsFile = { '': false, '.': false };
    this.previousUsedAsFile = {};

    this.writtenHashes = {};
    this.previousWrittenHashes = {};

    // foo/bar => foo/.build1234.bar
    // Should we include a random number? The advantage is that multiple
    // builds can run in parallel. The disadvantage is that stale build
    // files hang around forever. For now, go with the former.
    const nonce = Math.floor(Math.random() * 999999);
    this.buildPath = files.pathJoin(files.pathDirname(this.outputPath),
                                    '.build' + nonce + "." +
                                    files.pathBasename(this.outputPath));

    let resetBuildPath = true;

    // If we have a previous builder and we are allowed to re-use it,
    // let's keep all the older files on the file-system and replace
    // only outdated ones + write the new files in the same path
    if (previousBuilder && ENABLE_IN_PLACE_BUILDER_REPLACEMENT) {
      if (previousBuilder.outputPath !== outputPath) {
        throw new Error(
          `previousBuilder option can only be set to a builder with the same output path.
Previous builder: ${previousBuilder.outputPath}, this builder: ${outputPath}`
        );
      }

      if (files.exists(previousBuilder.outputPath)) {
        // write files in-place in the output directory of the previous builder
        this.buildPath = previousBuilder.outputPath;

        this.previousWrittenHashes = previousBuilder.writtenHashes;
        this.previousUsedAsFile = previousBuilder.usedAsFile;

        resetBuildPath = false;
      } else {
        resetBuildPath = true;
      }
    }

    // Build the output from scratch
    if (resetBuildPath) {
      files.rm_recursive(this.buildPath);
      files.mkdir_p(this.buildPath, 0o755);
    }

    this.watchSet = new WatchSet();

    // XXX cleaner error handling. don't make the humans read an
    // exception (and, make suitable for use in automated systems)
  }

  // Like mkdir_p, but records in self.usedAsFile that we have created
  // the directories, and takes a path relative to the bundle
  // root. Throws an exception on failure.
  _ensureDirectory(relPath) {
    const parts = files.pathNormalize(relPath).split(files.pathSep);
    if (parts.length > 1 && parts[parts.length - 1] === '') {
      // remove trailing slash
      parts.pop();
    }

    const partsSoFar = [];
    parts.forEach(part => {
      partsSoFar.push(part);
      const partial = partsSoFar.join(files.pathSep);
      if (! (partial in this.usedAsFile)) {
        let needToMkdir = true;
        if (partial in this.previousUsedAsFile) {
          if (this.previousUsedAsFile[partial]) {
            // was previously used as file, delete it, create a directory
            files.unlink(partial);
          } else {
            // is already a directory
            needToMkdir = false;
          }
        }

        if (needToMkdir) {
          // It's new -- create it
          files.mkdir(files.pathJoin(this.buildPath, partial), 0o755);
        }
        this.usedAsFile[partial] = false;
      } else if (this.usedAsFile[partial]) {
        // Already exists and is a file. Oops.
        throw new Error(`tried to make ${relPath} a directory but ${partial} is already a file`);
      } else {
        // Already exists and is a directory
      }
    });
  }

  // isDirectory defaults to false
  _sanitize(relPath, isDirectory) {
    const parts = relPath.split(files.pathSep);
    const partsOut = [];
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i];
      const shouldBeFile = (i === parts.length - 1) && ! isDirectory;
      const mustBeUnique = (i === parts.length - 1);

      // Basic sanitization
      if (part.match(/^\.+$/)) {
        throw new Error(`Path contains forbidden segment '${part}'`);
      }

      part = part.replace(/[^a-zA-Z0-9._\:-]/g, '');

      // If at last component, pull extension (if any) off of part
      let ext = '';
      if (shouldBeFile) {
        const split = part.split('.');
        if (split.length > 1) {
          ext = "." + split.pop();
        }
        part = split.join('.');
      }

      // Make sure it's sufficiently unique
      let suffix = '';
      while (true) {
        const candidate = files.pathJoin(partsOut.join(files.pathSep), part + suffix + ext);
        if (candidate.length) {
          // If we've never heard of this, then it's unique enough.
          if (!(candidate in this.usedAsFile)) {
            break;
          }
          // If we want this bit to be a directory, and we don't need it to be
          // unique (ie, it isn't the very last bit), and it's currently a
          // directory, then that's OK.
          if (!(mustBeUnique || this.usedAsFile[candidate])) {
            break;
          }
          // OK, either we want it to be unique and it already exists; or it is
          // currently a file (and we want it to be either a different file or a
          // directory).  Try a new suffix.
        }

        suffix++; // first increment will do '' -> 1
      }

      partsOut.push(part + suffix + ext);
    }

    return partsOut.join(files.pathSep);
  }

  // Write either a buffer or the contents of a file to `relPath` (a
  // path to a file relative to the bundle root), creating it (and any
  // enclosing directories) if it doesn't exist yet. Exactly one of
  // `data` and or `file` must be passed.
  //
  // Options:
  // - data: a Buffer to write to relPath. Overrides `file`.
  // - file: a filename to write to relPath, as a string.
  // - sanitize: if true, then all components of the path are stripped
  //   of any potentially troubling characters, an exception is thrown
  //   if any path segments consist entirely of dots (eg, '..'), and
  //   if there is a file in the bundle with the same relPath, then
  //   the path is changed by adding a numeric suffix.
  // - hash: a sha1 string used to determine if the contents of the
  //   new file written is not cached.
  // - executable: if true, mark the file as executable.
  // - symlink: if set to a string, create a symlink to its value
  //
  // Returns the final canonicalize relPath that was written to.
  //
  // If `file` is used then it will be added to the builder's WatchSet.
  write(relPath, {data, file, hash, sanitize, executable, symlink}) {
    // Ensure no trailing slash
    if (relPath.slice(-1) === files.pathSep) {
      relPath = relPath.slice(0, -1);
    }

    // In sanitize mode, ensure path does not contain segments like
    // '..', does not contain forbidden characters, and is unique.
    if (sanitize) {
      relPath = this._sanitize(relPath);
    }

    let getData = null;
    if (data) {
      if (! (data instanceof Buffer)) {
        throw new Error("data must be a Buffer");
      }
      if (file) {
        throw new Error("May only pass one of data and file, not both");
      }
      getData = () => data;
    } else if (file) {
      // postpone reading the file into memory
      getData = () => readAndWatchFile(this.watchSet, files.pathResolve(file));
    } else if (! symlink) {
      throw new Error('Builder can not write without either data or a file path or a symlink path: ' + relPath);
    }

    this._ensureDirectory(files.pathDirname(relPath));
    const absPath = files.pathJoin(this.buildPath, relPath);

    if (symlink) {
      files.symlink(symlink, absPath);
    } else {
      hash = hash || sha1(getData());

      if (this.previousWrittenHashes[relPath] !== hash) {
        // Builder is used to create build products, which should be read-only;
        // users shouldn't be manually editing automatically generated files and
        // expecting the results to "stick".
        atomicallyRewriteFile(absPath, getData(), {
          mode: executable ? 0o555 : 0o444
        });
      }

      this.writtenHashes[relPath] = hash;
    }
    this.usedAsFile[relPath] = true;

    return relPath;
  }

  // Serialize `data` as JSON and write it to `relPath` (a path to a
  // file relative to the bundle root), creating parent directories as
  // necessary. Throw an exception if the file already exists.
  writeJson(relPath, data) {
    // Ensure no trailing slash
    if (relPath.slice(-1) === files.pathSep) {
      relPath = relPath.slice(0, -1);
    }

    this._ensureDirectory(files.pathDirname(relPath));
    const absPath = files.pathJoin(this.buildPath, relPath);

    atomicallyRewriteFile(
      absPath,
      new Buffer(JSON.stringify(data, null, 2), 'utf8'),
      {mode: 0o444});

    this.usedAsFile[relPath] = true;
  }

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
  reserve(relPath, {directory} = {}) {
    // Ensure no trailing slash
    if (relPath.slice(-1) === files.pathSep) {
      relPath = relPath.slice(0, -1);
    }

    const parts = relPath.split(files.pathSep);
    const partsSoFar = [];
    for (let i = 0; i < parts.length; i ++) {
      const part = parts[i];
      partsSoFar.push(part);
      const soFar = partsSoFar.join(files.pathSep);
      if (this.usedAsFile[soFar]) {
        throw new Error("Path reservation conflict: " + relPath);
      }

      const shouldBeDirectory = (i < parts.length - 1) || directory;
      if (shouldBeDirectory) {
        if (! (soFar in this.usedAsFile)) {
          let needToMkdir = true;
          if (soFar in this.previousUsedAsFile) {
            if (this.previousUsedAsFile[soFar]) {
              files.unlink(soFar);
            } else {
              needToMkdir = false;
            }
          }
          if (needToMkdir) {
            files.mkdir(files.pathJoin(this.buildPath, soFar), 0o755);
          }
          this.usedAsFile[soFar] = false;
        }
      } else {
        this.usedAsFile[soFar] = true;
      }
    }

    // Return the path we reserved.
    return files.pathJoin(this.buildPath, relPath);
  }

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
  generateFilename(relPath, {directory} = {}) {
    relPath = this._sanitize(relPath, directory);
    this.reserve(relPath, { directory });
    return relPath;
  }

  // Convenience wrapper around generateFilename and write.
  //
  // (Note that in the object returned by builder.enter, this method
  // is patched through directly rather than rewriting its inputs and
  // outputs. This is only valid because it does nothing with its inputs
  // and outputs other than send pass them to other methods.)
  writeToGeneratedFilename(relPath, writeOptions) {
    const generated = this.generateFilename(relPath);
    this.write(generated, writeOptions);
    return generated;
  }

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
  copyDirectory({from, to, ignore, specificFiles, symlink, npmDiscards}) {
    if (to.slice(-1) === files.pathSep) {
      to = to.slice(0, -1);
    }

    const absPathTo = files.pathJoin(this.buildPath, to);
    if (symlink) {
      if (specificFiles) {
        throw new Error("can't copy only specific paths with a single symlink");
      }

      if (this.usedAsFile[to]) {
        throw new Error("tried to copy a directory onto " + to +
                        " but it is is already a file");
      }

      let canSymlink = true;
      // Symlinks don't work exactly the same way on Windows, and furthermore
      // they request Admin permissions to set.
      if (process.platform === 'win32') {
        canSymlink = false;
      } else if (to in this.usedAsFile) {
        // It's already here and is a directory, maybe because of a call to
        // reserve with {directory: true}. If it's an empty directory, this is
        // salvageable. The directory should exist, because all code paths which
        // set usedAsFile to false create the directory.
        //
        // XXX This is somewhat broken: what if the reason we're in
        // self.usedAsFile is because an immediate child of ours was reserved as
        // a file but not actually written yet?
        const children = files.readdir(absPathTo);
        if (Object.keys(children).length === 0) {
          files.rmdir(absPathTo);
        } else {
          canSymlink = false;
        }
      }

      if (canSymlink) {
        this._ensureDirectory(files.pathDirname(to));
        files.symlink(files.pathResolve(from), absPathTo);
        return;
      }
    }

    ignore = ignore || [];
    let specificPaths = null;
    if (specificFiles) {
      specificPaths = {};
      specificFiles.forEach(f => {
        while (f !== '.') {
          specificPaths[files.pathJoin(to, f)] = true;
          f = files.pathDirname(f);
        }
      });
    }

    let walk = (absFrom, relTo) => {
      this._ensureDirectory(relTo);

      files.readdir(absFrom).forEach(item => {
        const thisAbsFrom = files.pathResolve(absFrom, item);
        const thisRelTo = files.pathJoin(relTo, item);

        if (specificPaths && !(thisRelTo in specificPaths)) {
          return;
        }

        const fileStatus = files.lstat(thisAbsFrom);

        let itemForMatch = item;
        const isDirectory = fileStatus.isDirectory();
        if (isDirectory) {
          itemForMatch += '/';
        }

        // skip excluded files
        if (ignore.some(pattern => itemForMatch.match(pattern))) {
          return;
        }

        if (npmDiscards instanceof NpmDiscards &&
            npmDiscards.shouldDiscard(thisAbsFrom, isDirectory)) {
          return;
        }

        if (isDirectory) {
          walk(thisAbsFrom, thisRelTo);
        } else if (fileStatus.isSymbolicLink()) {
          files.symlink(files.readlink(thisAbsFrom),
                         files.pathResolve(this.buildPath, thisRelTo));
          // A symlink counts as a file, as far as "can you put something under
          // it" goes.
          this.usedAsFile[thisRelTo] = true;
        } else {
          // XXX can't really optimize this copying without reading
          // the file into memory to calculate the hash.
          files.copyFile(thisAbsFrom,
                         files.pathResolve(this.buildPath, thisRelTo),
                         fileStatus.mode);
          this.usedAsFile[thisRelTo] = true;
        }
      });
    };

    walk(from, to);
  }

  // Returns a new Builder-compatible object that works just like a
  // Builder, but interprets all paths relative to 'relPath', a path
  // relative to the bundle root which should not start with a '/'.
  //
  // The sub-builder returned does not have all Builder methods (for
  // example, complete() wouldn't make sense) and you should not rely
  // on it being instanceof Builder.
  enter(relPath) {
    const methods = ["write", "writeJson", "reserve", "generateFilename",
                   "copyDirectory", "enter"];
    const subBuilder = {};
    const relPathWithSep = relPath + files.pathSep;

    methods.forEach(method => {
      subBuilder[method] = (...args) => {
        if (method !== "copyDirectory") {
          // Normal method (relPath as first argument)
          args[0] = files.pathJoin(relPath, args[0]);
        } else {
          // with copyDirectory the path we have to fix up is inside
          // an options hash
          args[0].to = files.pathJoin(relPath, args[0].to);
        }

        let ret = this[method](...args);

        if (method === "generateFilename") {
          // fix up the returned path to be relative to the
          // sub-bundle, not the parent bundle
          if (ret.substr(0, 1) === '/') {
            ret = ret.substr(1);
          }
          if (ret.substr(0, relPathWithSep.length) !== relPathWithSep) {
            throw new Error("generateFilename returned path outside of " +
                            "sub-bundle?");
          }
          ret = ret.substr(relPathWithSep.length);
        }

        return ret;
      };
    });

    // Methods that don't have to fix up arguments or return values, because
    // they are implemented purely in terms of other methods which do.
    const passThroughMethods = ["writeToGeneratedFilename"];
    passThroughMethods.forEach(method => {
      subBuilder[method] = this[method];
    });

    return subBuilder;
  }

  // Move the completed bundle into its final location (outputPath)
  complete() {
    if (this.previousUsedAsFile) {
      // delete files and folders left-over from previous runs and not
      // re-used in this run
      const removed = {};
      const paths = Object.keys(this.previousUsedAsFile);
      paths.forEach((path) => {
        // if the same path was re-used, leave it
        if (this.usedAsFile.hasOwnProperty(path)) { return; }

        // otherwise, remove it as it is no longer needed

        // skip if already deleted
        if (removed.hasOwnProperty(path)) { return; }

        const absPath = files.pathJoin(this.buildPath, path);
        if (this.previousUsedAsFile[path]) {
          // file
          files.unlink(absPath);
          removed[path] = true;
        } else {
          // directory
          files.rm_recursive(absPath);

          // mark all sub-paths as removed, too
          paths.forEach((anotherPath) => {
            if (anotherPath.startsWith(path + '/')) {
              removed[anotherPath] = true;
            }
          });
        }
      });
    }

    // XXX Alternatively, we could just keep buildPath around, and make
    // outputPath be a symlink pointing to it. This doesn't work for the NPM use
    // case of renameDirAlmostAtomically since that one is constructing files to
    // be checked in to version control, but here we could get away with it.
    if (this.buildPath !== this.outputPath) {
      files.renameDirAlmostAtomically(this.buildPath, this.outputPath);
    }
  }

  // Delete the partially-completed bundle. Do not disturb outputPath.
  abort() {
    files.rm_recursive(this.buildPath);
  }

  // Returns a WatchSet representing all files that were read from disk by the
  // builder.
  getWatchSet() {
    return this.watchSet;
  }
}

function atomicallyRewriteFile(path, data, options) {
  let stat = null;
  try {
    stat = files.stat(path);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }

  if (stat && stat.isDirectory()) {
    files.rm_recursive(path);
    files.writeFile(path, data, options);
  } else {
    // create a different file with a random name and then rename over atomically
    const rname = '.builder-tmp-file.' + Math.floor(Math.random() * 999999);
    const rpath = files.pathJoin(files.pathDirname(path), rname);
    files.writeFile(rpath, data, options);
    files.rename(rpath, path);
  }
}

// Wrap slow methods into Profiler calls
const slowBuilderMethods = [
  '_ensureDirectory', 'write', 'enter', 'copyDirectory', 'enter', 'complete'
];

slowBuilderMethods.forEach(method => {
  Builder.prototype[method] =
    Profile(`Builder#${method}`, Builder.prototype[method]);
});
