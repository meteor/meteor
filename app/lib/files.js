var fs = require("fs");
var path = require('path');
var _ = require(path.join(__dirname, 'third', 'underscore.js'));

var files = module.exports = {
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

  // Returns true if this is a file we should monitor.
  // Iterate over all the interesting files, applying 'func' to each
  // file path. 'extensions' is an array of extensions to include (eg
  // ['.html', '.js'])
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
      } else if (_.indexOf(extensions, path.extname(filepath)) !== -1) {
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
    } else if (_.indexOf(extensions, path.extname(filepath)) !== -1) {
      ret.push(filepath);
    }

    return ret;
  },


  // given a path, returns true if it is a meteor application (has a
  // .meteor directory with a 'packages' file). false otherwise.
  is_app_dir: function (filepath) {
    return fs.existsSync(path.join(filepath, '.meteor', 'packages'));
  },

  // given a path, returns true if it is a meteor package (is a
  // directory with a 'packages.js' file). false otherwise.
  //
  // Note that a directory can be both a package _and_ an application.
  is_package_dir: function (filepath) {
    return fs.existsSync(path.join(filepath, 'package.js'));
  },

  // given a path, return true if this is a collection of packages.
  // This is used to run all the tests in meteor.
  is_package_collection_dir: function (filepath) {
    // XXX implementation is kinda specific to our code base, but this
    // is better than confusing the hell out of someone who names their
    // project 'packages'
    return path.basename(filepath) === 'packages' &&
      fs.existsSync(path.join(filepath, 'meteor', 'package.js'));
  },

  // given a predicate function and a starting path, traverse upwards
  // from the path until we find a path that satisfys the predicate.
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

  // compatibility shim. delete when unused.
  find_app_dir: function (filepath) {
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

  // True if we're in a git checkout of Meteor, else false (we're in
  // an installation.)
  in_checkout: function () {
    try {
      if (fs.existsSync(path.join(__dirname, '..', '..', '.git')))
        return true;
    } catch (e) { console.log(e);}

    return false;
  },

  // Return the root of dev_bundle (probably /usr/local/meteor in an
  // install, or (checkout root)/dev_bundle in a checkout..)
  get_dev_bundle: function () {
    if (files.in_checkout()) {
      return path.join(__dirname, '..', '..', 'dev_bundle');
    }
    else
      return path.join(__dirname, '..', '..');
  },
  
  // returns a list of places where packages can be found.
  // 1. directories set via process.env.PACKAGES_DIRS
  // 2. default is packages/ in the meteor directory
  // XXX: 3. a per project directory? (vendor/packages in rails parlance?)
  get_package_dirs: function() {
    var package_dirs = [path.join(__dirname, '..', '..', 'packages')];
    if (process.env.PACKAGE_DIRS)
      package_dirs = process.env.PACKAGE_DIRS.split(':').concat(package_dirs);
    
    return package_dirs;
  },
  
  // search package dirs for a package named name. 
  // undefined if the package isn't in any dir
  get_package_dir: function (name) {
    var ret;
    _.find(this.get_package_dirs(), function(package_dir) {
      var dir = path.join(package_dir, name);
      if (fs.existsSync(path.join(dir, 'package.js'))) {
        ret = dir;
        return true;
      }
    });
    
    return ret;
  },

  // Return the directory that contains the core tool (the top-level
  // 'app' directory)
  get_core_dir: function () {
    return path.join(__dirname, '..', '..', 'app');
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
      fs.rmdirSync(p)
    } else
      fs.unlinkSync(p);
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
  cp_r: function (from, to, options) {
    options = options || {};
    files.mkdir_p(to, 0755);
    _.each(fs.readdirSync(from), function (f) {
      if (_.any(options.ignore || [], function (pattern) {
        return f.match(pattern);
      })) return;

      var full_from = path.join(from, f);
      if (options.transform_filename)
        f = options.transform_filename(f);
      var full_to = path.join(to, f);
      if (fs.statSync(full_from).isDirectory())
        files.cp_r(full_from, full_to, options);
      else {
        if (!options.transform_contents) {
          // XXX reads full file into memory.. lame.
          fs.writeFileSync(full_to, fs.readFileSync(full_from))
        } else {
          var contents = fs.readFileSync(full_from);
          contents = options.transform_contents(contents, f);
          fs.writeFileSync(full_to, contents);
        }
      }
    });
  },

  // Make a temporary directory. Returns the path to the newly created
  // directory. Caller is responsible for deleting the directory later.
  mkdtemp: function (prefix) {
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
  }

};
