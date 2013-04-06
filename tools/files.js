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
var zlib = require("zlib");
var tar = require("tar");
var Future = require('fibers/future');
var request = require('request');

var fstream = require('fstream');

var cleanup = require('./cleanup.js');

var files = exports;
_.extend(exports, {
  // A sort comparator to order files into load order.
  sort: function (a, b) {
    // main.* loaded last
    var ismain_a = (path.basename(a).indexOf('main.') === 0);
    var ismain_b = (path.basename(b).indexOf('main.') === 0);
    if (ismain_a !== ismain_b) {
      return (ismain_a ? 1 : -1);
    }

    // /lib/ loaded first
    var islib_a = (a.indexOf(path.sep + 'lib' + path.sep) !== -1);
    var islib_b = (b.indexOf(path.sep + 'lib' + path.sep) !== -1);
    if (islib_a !== islib_b) {
      return (islib_a ? -1 : 1);
    }

    // deeper paths loaded first.
    var len_a = a.split(path.sep).length;
    var len_b = b.split(path.sep).length;
    if (len_a !== len_b) {
      return (len_a < len_b ? 1 : -1);
    }

    // otherwise alphabetical
    return (a < b ? -1 : 1);
  },

  // Returns true if this is a file we should maybe care about (stat it,
  // descend if it is a directory, etc).
  pre_filter: function (filename) {
    if (!filename) { return false; }
    // no . files
    var base = path.basename(filename);
    if (base && base[0] === '.') { return false; }

    // XXX
    // first, we only want to exclude APP_ROOT/public, not some deeper public
    // second, we don't really like this at all
    // third, we don't update the app now if anything here changes
    if (base === 'public') { return false; }

    return true;
  },

  // Returns true if this is a file we should monitor.  Iterate over
  // all the interesting files, applying 'func' to each file
  // path. 'extensions' is an array of extensions to include, without
  // leading dots (eg ['html', 'js'])
  file_list_async: function (filepath, extensions, func) {
    if (!files.pre_filter(filepath)) { return; }
    fs.stat(filepath, function(err, stats) {
      if (err) {
        // XXX!
        return;
      }

      if (stats.isDirectory()) {
        fs.readdir(filepath, function(err, fileNames) {
          if(err) {
            // XXX!
            return;
          }

          _.each(fileNames, function (fileName) {
            files.file_list_async(path.join(filepath, fileName),
                                  extensions, func);
          });
        });
      } else if (files.findExtension(extensions, filepath)) {
        func(filepath);
      }
    });
  },

  file_list_sync: function (filepath, extensions) {
    var ret = [];
    if (!files.pre_filter(filepath)) { return ret; }
    var stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      var fileNames = fs.readdirSync(filepath);
      _.each(fileNames, function (fileName) {
        ret = ret.concat(files.file_list_sync(
          path.join(filepath, fileName), extensions));
      });
    } else if (files.findExtension(extensions, filepath)) {
      ret.push(filepath);
    }

    return ret;
  },

  // given a list of extensions (no leading dots) and a path, return
  // the file extension provided in the list. If it doesn't find it,
  // return null.
  findExtension: function (extensions, filepath) {
    var len = filepath.length;
    for (var i = 0; i < extensions.length; ++i) {
      var ext = "." + extensions[i];
      if (filepath.indexOf(ext, len - ext.length) !== -1){
        return ext;
      }
    }
    return null;
  },

  // given a path, returns true if it is a meteor application (has a
  // .meteor directory with a 'packages' file). false otherwise.
  is_app_dir: function (filepath) {
    // XXX once we are done with the transition to engine, this should
    // change to: `return fs.existsSync(path.join(filepath, '.meteor',
    // 'release'))`

    // .meteor/packages can be a directory, if .meteor is a warehouse
    // directory.  since installing meteor initializes a warehouse at
    // $HOME/.meteor, we want to make sure your home directory (and
    // all subdirectories therein) don't count as being within a
    // meteor app.
    try { // use try/catch to avoid the additional syscall to fs.existsSync
      return fs.statSync(path.join(filepath, '.meteor', 'packages')).isFile();
    } catch (e) {
      return false;
    }
  },

  // given a path, returns true if it is a meteor package (is a
  // directory with a 'packages.js' file). false otherwise.
  //
  // Note that a directory can be both a package _and_ an application.
  is_package_dir: function (filepath) {
    return fs.existsSync(path.join(filepath, 'package.js'));
  },

  // given a predicate function and a starting path, traverse upwards
  // from the path until we find a path that satisfies the predicate.
  //
  // returns either the path to the lowest level directory that passed
  // the test or null for none found. if starting path isn't given, use
  // cwd.
  find_upwards: function (predicate, start_path) {
    var test_dir = start_path || process.cwd();
    while (test_dir) {
      if (predicate(test_dir)) {
        break;
      }
      var new_dir = path.dirname(test_dir);
      if (new_dir === test_dir) {
        test_dir = null;
      } else {
        test_dir = new_dir;
      }
    }
    if (!test_dir)
      return null;

    return test_dir;
  },

  findAppDir: function (filepath) {
    return files.find_upwards(files.is_app_dir, filepath);
  },

  // create a .gitignore file in dir_path if one doesn't exist. add
  // 'entry' to the .gitignore on its own line at the bottom of the
  // file, if the exact line does not already exist in the file.
  add_to_gitignore: function (dir_path, entry) {
    var filepath = path.join(dir_path, ".gitignore");
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
  },

  // Are we running Meteor from a git checkout?
  in_checkout: function () {
    try {
      if (fs.existsSync(path.join(files.getCurrentToolsDir(), '.git')))
        return true;
    } catch (e) { console.log(e);}

    return false;
  },

  // True if we are using a warehouse: either installed Meteor, or if
  // $METEOR_WAREHOUSE_DIR is set. Otherwise false (we're in a git checkout and
  // just using packages from the checkout).
  usesWarehouse: function () {
    // Test hook: act like we're "installed" using a non-homedir warehouse
    // directory.
    if (process.env.METEOR_WAREHOUSE_DIR)
      return true;
    else
      return !files.in_checkout();
  },

  // Read the '.tools_version.txt' file. If in a checkout, throw an error.
  getToolsVersion: function () {
    if (!files.in_checkout()) {
      return fs.readFileSync(
        path.join(files.getCurrentToolsDir(), '.tools_version.txt'), 'utf8');
    } else {
      throw new Error("Unexpected. Git checkouts don't have tools versions.");
    }
  },

  // Return the root of dev_bundle (probably /usr/local/meteor in an
  // install, or (checkout root)/dev_bundle in a checkout..)
  get_dev_bundle: function () {
    if (files.in_checkout())
      return path.join(files.getCurrentToolsDir(), 'dev_bundle');
    else
      return files.getCurrentToolsDir();
  },

  // Return the top-level directory for this meteor install or checkout
  getCurrentToolsDir: function () {
    return path.join(__dirname, '..');
  },

  // Try to find the prettiest way to present a path to the
  // user. Presently, the main thing it does is replace $HOME with ~.
  pretty_path: function (path) {
    path = fs.realpathSync(path);
    var home = process.env.HOME;
    if (home && path.substr(0, home.length) === home)
      path = "~" + path.substr(home.length);
    return path;
  },

  // Like rm -r.
  rm_recursive: function (p) {
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
  },

  // Makes all files in a tree read-only.
  makeTreeReadOnly: function (p) {
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
        files.makeTreeReadOnly(path.join(p, file));
      });
    }
    if (stat.isFile()) {
      var permissions = stat.mode & 0777;
      var readOnlyPermissions = permissions & 0555;
      if (permissions !== readOnlyPermissions)
        fs.chmodSync(p, readOnlyPermissions);
    }
  },

  // like mkdir -p. if it returns true, the item is a directory (even
  // if it was already created). if it returns false, the item is not
  // a directory and we couldn't make it one.
  mkdir_p: function (dir, mode) {
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
  },

  // Roughly like cp -R. 'from' should be a directory. 'to' can either
  // be a directory, or it can not exist (in which case it will be
  // created with mkdir_p.) Doesn't think about file mode at all.
  //
  // If options.transformer_{filename, contents} is present, it should
  // be a function, and the contents (as a buffer) or filename will be
  // passed through the function. Use this to, eg, fill templates.
  //
  // If options.ignore is present, it should be a list of regexps. Any
  // file whose basename matches one of the regexps, before
  // transformation, will be skipped.
  //
  // Returns the list of relative file paths copied to the
  // destination, as filtered by ignore and transformed by
  // transformer_filename.
  cp_r: function (from, to, options) {
    options = options || {};
    files.mkdir_p(to, 0755);
    var copied = [];
    _.each(fs.readdirSync(from), function (f) {
      if (_.any(options.ignore || [], function (pattern) {
        return f.match(pattern);
      })) return;

      var full_from = path.join(from, f);
      if (options.transform_filename)
        f = options.transform_filename(f);
      var full_to = path.join(to, f);
      if (fs.statSync(full_from).isDirectory()) {
        var subdir_paths = files.cp_r(full_from, full_to, options);
        copied = copied.concat(_.map(subdir_paths, function (subpath) {
          return path.join(f, subpath);
        }));
      }
      else {
        if (!options.transform_contents) {
          // XXX reads full file into memory.. lame.
          fs.writeFileSync(full_to, fs.readFileSync(full_from));
        } else {
          var contents = fs.readFileSync(full_from);
          contents = options.transform_contents(contents, f);
          fs.writeFileSync(full_to, contents);
        }
        copied.push(f);
      }
    });
    return copied;
  },

  // Make a temporary directory. Returns the path to the newly created
  // directory. We clean up on exit.
  mkdtemp: function (prefix) {
    var make = function () {
      prefix = prefix || 'meteor-temp-';
      // find /tmp
      var tmp_dir = _.first(_.map(['TMPDIR', 'TMP', 'TEMP'], function (t) {
        return process.env[t];
      }).filter(_.identity)) || path.sep + 'tmp';
      tmp_dir = fs.realpathSync(tmp_dir);

      // make the directory. give it 3 tries in case of collisions from
      // crappy random.
      var tries = 3;
      while (tries > 0) {
        var dir_path = path.join(
          tmp_dir, prefix + (Math.random() * 0x100000000 + 1).toString(36));
        try {
          fs.mkdirSync(dir_path, 0755);
          return dir_path;
        } catch (err) {
          tries--;
        }
      }
      throw new Error("failed to make tempory directory in " + tmp_dir);
    };
    var dir = make();
    tempDirs.push(dir);
    return dir;
  },

  _cleanUpTempDirs: function (sig) {
    _.each(tempDirs, files.rm_recursive);
    tempDirs = [];
  },

  // Takes a buffer containing `.tar.gz` data and extracts the archive into a
  // destination directory. destPath should not exist yet, and the archive
  // should contain a single top-level directory, which will be renamed
  // atomically to destPath. The entire tree will be made readonly.
  extractTarGz: function (buffer, destPath) {
    var parentDir = path.dirname(destPath);
    var tempDir = path.join(parentDir, '.tmp' + files._randomToken());
    files.mkdir_p(tempDir);

    var future = new Future;

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

    // write the buffer to the (gunzip|untar) pipeline; these calls cause the
    // tar to be extracted to disk.
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
    files.makeTreeReadOnly(extractDir);
    fs.renameSync(extractDir, destPath);
    fs.rmdirSync(tempDir);
  },

  // Tar-gzips a directory, returning a stream that can then
  // be piped as needed.  The tar archive will contain a top-level
  // directory named after dirPath.
  createTarGzStream: function (dirPath) {
    return fstream.Reader({ path: dirPath, type: 'Directory' }).pipe(
      tar.Pack()).pipe(zlib.createGzip());
  },

  // Tar-gzips a directory into a tarball on disk, synchronously.
  // The tar archive will contain a top-level directory named after dirPath.
  createTarball: function (dirPath, tarball) {
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
  },

  // A synchronous wrapper around request(...) that returns the response "body"
  // or throws.
  getUrl: function (urlOrOptions, callback) {
    var future = new Future;
    // can't just use Future.wrap, because we want to return "body", not
    // "response".

    urlOrOptions = _.clone(urlOrOptions); // we are going to change it
    var appVersion;
    try {
      appVersion = getToolsVersion();
    } catch(e) {
      appVersion = 'checkout';
    }

    // meteorReleaseContext - an option with information about app directory
    // release versions, etc, is used to get exact Meteor version used.
    if (urlOrOptions.hasOwnProperty('meteorReleaseContext')) {
      // Get meteor app release version: if specified in command line args, take
      // releaseVersion, if not specified, try global meteor version
      var meteorReleaseContext = urlOrOptions.meteorReleaseContext;
      appVersion = meteorReleaseContext.releaseVersion;

      if (appVersion === 'none')
        appVersion = meteorReleaseContext.appReleaseVersion;
      if (appVersion === 'none')
        appVersion = 'checkout';

      delete urlOrOptions.meteorReleaseContext;
    }

    // Get some kind of User Agent: environment information.
    var ua = util.format('Meteor/%s OS/%s (%s; %s; %s;)',
              appVersion, os.platform(), os.type(), os.release(), os.arch());

    var headers = {'User-Agent': ua };

    if (_.isObject(urlOrOptions))
      urlOrOptions.headers = _.extend(headers, urlOrOptions.headers);
    else
      urlOrOptions = { url: urlOrOptions, headers: headers };

    request(urlOrOptions, function (error, response, body) {
      if (error)
        future.throw(new files.OfflineError(error));
      else if (response.statusCode >= 400 && response.statusCode < 600)
        future.throw(response);
      else
        future.return(body);
    });
    return future.wait();
  },

  OfflineError: function (error) {
    this.error = error;
  },

  _randomToken: function() {
    return (Math.random() * 0x100000000 + 1).toString(36);
  }
});


var tempDirs = [];
cleanup.onExit(files._cleanUpTempDirs);
