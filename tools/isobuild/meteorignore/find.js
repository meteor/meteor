// https://github.com/yuanchuan/find/blob/master/index.js

var fs = require('fs');
var path = require('path');
var Chain = require('./chain');


/**
 * Outline the APIs.
 */
var find = module.exports = {

  // file:      function([pat,] root, callback) {}
  // dir:       function([pat,] root, callback) {}

  // eachfile:  function([pat,] root, action) {}
  // eachdir:   function([pat,] root, action) {}

  // fileSync:  function([pat,] root) {}
  // dirSync:   function([pat,] root) {}

};


var fss = {};

/**
 *  Error handler wrapper.
 */
fss.errorHandler = function(err) {
  if (err) {
    if (find.__errorHandler) {
      find.__errorHandler(err);
    } else {
      throw err;
    }
  }
};


var error = {
  notExist: function(name) {
    return new Error(name + ' does not exist.');
  }
};


var is = (function() {
  function existed(name) {
    return fs.existsSync(name)
  }
  function fsType(type) {
    return function(name) {
      try {
        return fs.lstatSync(name)['is' + type]()
      } catch(e) {
        fss.errorHandler(e);
      }
    }
  }
  function objType(type) {
    return function(input) {
      return ({}).toString.call(input) === '[object ' + type +  ']';
    }
  }
  return {
    existed:      existed,
    file:         fsType('File'),
    directory:    fsType('Directory'),
    symbolicLink: fsType('SymbolicLink'),

    string:       objType('String'),
    regexp:       objType('RegExp'),
    func:         objType('Function')
  };
}());


/**
 *  Method injection for handling errors.
 */
['readdir', 'lstat'].forEach(function(method) {
  var origin = fs[method];
  fss[method] = function(path, callback) {
    return origin.apply(fs, [path, function(err) {
      fss.errorHandler(err);
      return callback.apply(null, arguments);
    }]);
  }
});


/**
 * Enhancement for fs.readlink && fs.readlinkSync.
 */
fss.readlink = function(name, fn, depth) {
  if (depth == undefined) depth = 10;
  if (!is.existed(name) && (depth < 10)) {
    return fn(path.resolve(name));
  }
  var isSymbolicLink = is.symbolicLink(name);
  if (!isSymbolicLink) {
    fn(path.resolve(name));
  } else if (depth) {
    fs.readlink(name, function(err, origin) {
      fss.errorHandler(err);
      fss.readlink(origin, fn, --depth);
    });
  } else {
    fn(isSymbolicLink ? '' : path.resolve(name));
  }
}

fss.readlinkSync = function(name, depth) {
  if (depth == undefined) depth = 10;
  if (!is.existed(name) && depth < 10) {
    return path.resolve(name);
  }
  var isSymbolicLink = is.symbolicLink(name);
  if (!isSymbolicLink) {
    return path.resolve(name);
  } else if (depth) {
    var origin = fs.readlinkSync(name);
    return fss.readlinkSync(origin, --depth);
  } else {
    return isSymbolicLink ? '' : path.resolve(name);
  }
}


/**
 * Check pattern against the path
 */
var compare = function(pat, name) {
  var str = path.basename(name);
  return (
    is.regexp(pat) && pat.test(name)
    || is.string(pat) && pat === str
  );
};


/**
 * Traverse a directory recursively and asynchronously.
 *
 * @param {String} root
 * @param {String} type
 * @param {Function} action
 * @param {Function} callback
 * @param {Chain} c
 * @api private
 */
var traverseAsync = function(root, type, action, callback, c) {
  if (!is.existed(root)) {
    fss.errorHandler(error.notExist(root))
  }
  if (is.directory(root)) {
    fss.readdir(root, function(err, all) {
      var chain = Chain();
      all && all.forEach(function(dir) {
        dir = path.join(root, dir);
        chain.add(function() {
          var handleFile = function() {
            if (type == 'file') action(dir);
            process.nextTick(function() { chain.next() });
          }
          var handleDir = function(skip) {
            if (type == 'dir') action(dir);
            if (skip) chain.next();
            else process.nextTick(function() { traverseAsync(dir, type, action, callback, chain)});
          }
          var isSymbolicLink = is.symbolicLink(dir);
          if (is.directory(dir)) {
            handleDir();
          } else if (isSymbolicLink) {
            fss.readlink(dir, function(origin) {
              if (origin) {
                if (is.existed(origin) && is.directory(origin)) {
                  handleDir(isSymbolicLink)
                } else {
                  handleFile()
                }
              } else {
                chain.next();
              }
            });
          } else {
            handleFile();
          }
        })
      });
      chain.traverse(function() {
        c ? c.next() : callback();
      });
    });
  }
}


/**
 * Traverse a directory recursively.
 *
 * @param {String} root
 * @param {String} type
 * @param {Function} action
 * @return {Array} the result
 * @api private
 */
var traverseSync = function(root, type, action) {
  if (!is.existed(root)) throw error.notExist(root);
  if (is.directory(root)) {
    fs.readdirSync(root).forEach(function(dir) {
      dir = path.join(root, dir);
      var handleDir = function(skip) {
        if (type == 'dir') action(dir);
        if (skip) return;
        traverseSync(dir, type, action);
      }
      var handleFile = function() {
        if (type == 'file') action(dir);
      }
      var isSymbolicLink = is.symbolicLink(dir);
      if (is.directory(dir)) {
        handleDir();
      } else if (isSymbolicLink) {
        var origin = fss.readlinkSync(dir);
        if (origin) {
          if (is.existed(origin) && is.directory(origin)) {
            handleDir(isSymbolicLink);
          } else {
            handleFile();
          }
        }
      } else {
        handleFile();
      }
    });
  }
};


['file', 'dir'].forEach(function(type) {

  /**
   * `find.file` and `find.dir`
   *
   * Find files or sub-directories in a given directory and
   * passes the result in an array as a whole. This follows
   * the default callback style of nodejs, think about `fs.readdir`,
   *
   * @param {RegExp|String} pat
   * @param {String} root
   * @param {Function} fn
   * @api public
   */
  find[type] = function(pat, root, fn) {
    var buffer = [];
    if (arguments.length == 2) {
      fn = root;
      root = pat;
      pat = '';
    }
    process.nextTick(function() {
      traverseAsync(
        root
        , type
        , function(n) { buffer.push(n);}
        , function() {
          if (is.func(fn) && pat) {
            fn(buffer.filter(function(n) {
              return compare(pat, n);
            }));
          } else {
            fn(buffer);
          }
        }
      );
    });
    return {
      error: function(handler) {
        if (is.func(handler)) {
          find.__errorHandler = handler;
        }
      }
    }
  }

  /**
   * `find.eachfile` and `find.eachdir`
   *
   * Find files or sub-directories in a given directory and
   * apply with a given action to each result immediately
   * rather than pass them back as an array.
   *
   * @param {RegExp|String} pat
   * @param {String} root
   * @param {Function} action
   * @return {Object} for chain methods
   * @api public
   *
   */
  find['each' + type] = function(pat, root, action) {
    var callback = function() {}
    if (arguments.length == 2) {
      action = root;
      root = pat;
      pat = '';
    }
    process.nextTick(function() {
      traverseAsync(
        root
        , type
        , function(n) {
          if (!is.func(action)) return;
          if (!pat || compare(pat, n)) {
            action(n);
          }
        }
        , callback
      );
    });
    return {
      end: function(fn) {
        if (is.func(fn)) {
          callback = fn;
        }
        return this;
      },
      error: function(handler) {
        if (is.func(handler)) {
          find.__errorHandler = handler;
        }
        return this;
      }
    };
  }

  /**
   * `find.fileSync` and `find.dirSync`
   *
   * Find files or sub-directories in a given directory synchronously
   * and returns the result as an array. This follows the default 'Sync'
   * methods of nodejs, think about `fs.readdirSync`,
   *
   * @param {RegExp|String} pat
   * @param {String} root
   * @return {Array} the result
   * @api public
   */
  find[type + 'Sync'] = function(pat, root) {
    var buffer = [];
    if (arguments.length == 1) {
      root = pat;
      pat = '';
    }
    traverseSync(root, type, function(n) {
      buffer.push(n);
    });
    return pat && buffer.filter(function(n) {
      return compare(pat, n);
    }) || buffer;
  }

});