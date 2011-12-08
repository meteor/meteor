var fs = require("fs");
var path = require('path');
var _ = require('./third/underscore.js');

var files = module.exports = {
  // A sort comparator to order files into load order.
  sort: function (a, b) {
    // main.* loaded last
    ismain_a = (path.basename(a).indexOf('main.') === 0);
    ismain_b = (path.basename(b).indexOf('main.') === 0);
    if (ismain_a !== ismain_b) {
      return (ismain_a ? 1 : -1);
    }

    // /lib/ loaded first
    islib_a = (a.indexOf('/lib/') !== -1);
    islib_b = (b.indexOf('/lib/') !== -1);
    if (islib_a !== islib_b) {
      return (islib_a ? -1 : 1);
    }

    // deeper paths loaded first.
    len_a = a.split('/').length;
    len_b = b.split('/').length;
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
    if (filename.indexOf('/public/') !== -1) { return false; }

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

          fileNames.forEach(function (fileName) {
            files.file_list_async(path.join(filepath, fileName),
                                  extensions, func);
          });
        });
      } else if (extensions.indexOf(path.extname(filepath)) !== -1) {
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
      fileNames.forEach(function (fileName) {
        ret = ret.concat(files.file_list_sync(
          path.join(filepath, fileName), extensions));
      });
    } else if (extensions.indexOf(path.extname(filepath)) !== -1) {
      ret.push(filepath);
    }

    return ret;
  },

  // given a path, traverse upwards until we find a .skybreak
  // directory that contains a 'packages' file. returns either the
  // path to a top-level app or null for no app found. if filepath
  // isn't given, use cwd.
  find_app_dir: function (filepath) {
    var test_dir = filepath || process.cwd();
    while (test_dir) {
      if (path.existsSync(path.join(test_dir, '.skybreak/packages'))) {
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

  // create a .gitignore file in dir_path if one doesn't exist. add
  // 'entry' to the .gitignore on its own line at the bottom of the
  // file, if the exact line does not already exist in the file.
  // XXX unused. remove?
  add_to_gitignore: function (dir_path, entry) {
    var filepath = path.join(dir_path, ".gitignore");
    if (path.existsSync(filepath)) {
      var data = fs.readFileSync(filepath, 'utf8');
      var lines = data.split(/\n/);
      if (_.any(lines, function (x) { return x === entry })) {
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

  // True if we're in a git checkout of Skybreak, else false (we're in
  // an installation.)
  in_checkout: function () {
    try {
      if (path.existsSync(path.join(__dirname, "../../.git")))
        return true;
    } catch (e) { console.log(e);}

    return false;
  },

  // Return the root of dev_bundle (probably /usr/local/skybreak in an
  // install, or (checkout root)/dev_bundle in a checkout..)
  get_dev_bundle: function () {
    if (files.in_checkout()) {
      return path.join(__dirname, '../../dev_bundle');
    }
    else
      return path.join(__dirname, '../..');
  },

  // Return where the packages are stored
  get_package_dir: function () {
    return path.join(__dirname, '../../packages');
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
      fs.readdirSync(p).forEach(function (file) {
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
    var ps = path.normalize(p).split('/');

    if (path.existsSync(p)) {
      if (fs.statSync(p).isDirectory()) { return true;}
      return false;
    }

    // doesn't exist. recurse to build parent.
    var success = files.mkdir_p(ps.slice(0,-1).join('/'), mode);
    // parent is not a directory.
    if (!success) { return false; }

    fs.mkdirSync(p, mode);

    // double check we exist now
    if (!path.existsSync(p) ||
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
    fs.readdirSync(from).forEach(function (f) {
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
  }

};
