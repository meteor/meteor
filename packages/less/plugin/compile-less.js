var fs = Npm.require('fs');
var path = Npm.require('path');
var less = Npm.require('less');
var util = Npm.require('util');
var Future = Npm.require('fibers/future');
var LRU = Npm.require('lru-cache');

Plugin.registerCompiler({
  extensions: ['less'],
  archMatching: 'web'
}, function () {
    return new LessCompiler();
});

var CACHE_SIZE = process.env.METEOR_LESS_CACHE_SIZE || 1024*1024*10;
var CACHE_DEBUG = !! process.env.METEOR_TEST_PRINT_CACHE_DEBUG;

var LessCompiler = function () {
  var self = this;
  // absoluteImportPath -> { hashes, css, sourceMap }
  //   where hashes is a map from absoluteImportPath -> hash of all
  //   paths used by it (including it itself)
  self._cache = new LRU({
    max: CACHE_SIZE,
    // Cache is measured in bytes (not counting the hashes).
    length: function (value) {
      return value.css.length + sourceMapLength(value.sourceMap);
    }
  });
  self._diskCache = null;
  // For testing.
  self._callCount = 0;
};
_.extend(LessCompiler.prototype, {
  processFilesForTarget: function (inputFiles) {
    var self = this;
    var filesByAbsoluteImportPath = {};
    var mains = [];
    var cacheMisses = [];

    function decodeFilePath (filePath) {
      var match = filePath.match(/^{(.*)}\/(.*)$/);
      if (! match)
        throw new Error('Failed to decode Less path: ' + filePath);

      if (match[1] === '') {
        // app
        return match[2];
      }

      return 'packages/' + match[1] + '/' + match[2];
    }

    inputFiles.forEach(function (inputFile) {
      var packageName = inputFile.getPackageName();
      var pathInPackage = inputFile.getPathInPackage();
      var absoluteImportPath = packageName === null
            ? ('{}/' + pathInPackage)
            : ('{' + packageName + '}/' + pathInPackage);
      filesByAbsoluteImportPath[absoluteImportPath] = inputFile;
      // Match files named `main.less` or with a `.main.less` extension
      if (pathInPackage.match(/(^|\/|\.)main\.less$/)) {
        mains.push({inputFile: inputFile,
                    absoluteImportPath: absoluteImportPath});
      }
    });

    var importPlugin = new MeteorImportLessPlugin(filesByAbsoluteImportPath);

    mains.forEach(function (main) {
      var inputFile = main.inputFile;
      var absoluteImportPath = main.absoluteImportPath;

      var cacheEntry = self._cache.get(absoluteImportPath);
      if (! (cacheEntry &&
             self._cacheEntryValid(cacheEntry, filesByAbsoluteImportPath))) {
        cacheMisses.push(inputFile.getDisplayPath());
        var f = new Future;
        less.render(inputFile.getContentsAsBuffer().toString('utf8'), {
          filename: absoluteImportPath,
          plugins: [importPlugin],
          // Generate a source map, and include the source files in the
          // sourcesContent field.  (Note that source files which don't
          // themselves produce text (eg, are entirely variable definitions)
          // won't end up in the source map!)
          sourceMap: { outputSourceFiles: true }
        }, f.resolver());
        try {
          var output = f.wait();
        } catch (e) {
          inputFile.error({
            message: e.message,
            sourcePath: decodeFilePath(e.filename),
            line: e.line,
            column: e.column
          });
          return;  // go on to next file
        }

        if (output.map) {
          var map = JSON.parse(output.map);
          map.sources = map.sources.map(decodeFilePath);
          output.map = map;
        }
        cacheEntry = {
          hashes: {},
          css: output.css,
          sourceMap: output.map
        };
        // Make this cache entry depend on the hash of the file itself...
        cacheEntry.hashes[absoluteImportPath] = inputFile.getSourceHash();
        // ... and of all files it (transitively) imports, helpfully provided
        // to us by less.render.
        output.imports.forEach(function (path) {
          if (! filesByAbsoluteImportPath.hasOwnProperty(path)) {
            throw Error("Imported an unknown file?");
          }
          var importedInputFile = filesByAbsoluteImportPath[path];
          cacheEntry.hashes[path] = importedInputFile.getSourceHash();
        });
        // Override existing cache entry, if any.
        self._cache.set(absoluteImportPath, cacheEntry);
      }

      inputFile.addStylesheet({
        data: cacheEntry.css,
        path: inputFile.getPathInPackage() + '.css',
        sourceMap: cacheEntry.sourceMap
      });
    });

    // Rewrite the cache to disk.
    // XXX #BBPBetterCache we should just write individual entries separately.
    self._writeCache();

    if (CACHE_DEBUG) {
      cacheMisses.sort();
      console.log("Ran less.render (#%s) on: %s",
                  ++self._callCount, JSON.stringify(cacheMisses));
    }
  },
  _cacheEntryValid: function (cacheEntry, filesByAbsoluteImportPath) {
    var self = this;
    return _.all(cacheEntry.hashes, function (hash, path) {
      return _.has(filesByAbsoluteImportPath, path) &&
        filesByAbsoluteImportPath[path].getSourceHash() === hash;
    });
  },

  setDiskCacheDirectory: function (diskCache) {
    var self = this;
    if (self._diskCache)
      throw Error("setDiskCacheDirectory called twice?");
    self._diskCache = diskCache;
    self._readCache();
  },
  // XXX #BBPBetterCache this is an inefficiently designed cache that will cause
  // quadratic behavior due to writing the whole cache on each write, and has no
  // error handling, and uses sync, and has an exists/read race condition, and
  // might not work on Windows
  _cacheFile: function () {
    var self = this;
    return path.join(self._diskCache, 'cache.json');
  },
  _readCache: function () {
    var self = this;
    var cacheFile = self._cacheFile();
    if (! fs.existsSync(cacheFile))
      return;
    var cacheJSON = JSON.parse(fs.readFileSync(cacheFile));
    _.each(cacheJSON, function (value, cacheKey) {
      self._cache.set(cacheKey, value);
    });
    if (CACHE_DEBUG) {
      console.log("Loaded less cache");
    }
  },
  _writeCache: function () {
    var self = this;
    if (! self._diskCache)
      return;
    var cacheJSON = {};
    self._cache.forEach(function (value, cacheKey) {
      cacheJSON[cacheKey] = value;
    });
    fs.writeFileSync(self._cacheFile(), JSON.stringify(cacheJSON));
  }
});

var MeteorImportLessPlugin = function (filesByAbsoluteImportPath) {
  var self = this;
  self.filesByAbsoluteImportPath = filesByAbsoluteImportPath;
};
_.extend(MeteorImportLessPlugin.prototype, {
  install: function (less, pluginManager) {
    var self = this;
    pluginManager.addFileManager(
      new MeteorImportLessFileManager(self.filesByAbsoluteImportPath));
  },
  minVersion: [2, 5, 0]
});

var MeteorImportLessFileManager = function (filesByAbsoluteImportPath) {
  var self = this;
  self.filesByAbsoluteImportPath = filesByAbsoluteImportPath;
};
util.inherits(MeteorImportLessFileManager, less.AbstractFileManager);
_.extend(MeteorImportLessFileManager.prototype, {
  // We want to be the only active FileManager, so claim to support everything.
  supports: function () {
    return true;
  },

  loadFile: function (filename, currentDirectory, options, environment, cb) {
    var self = this;
    var packageMatch = currentDirectory.match(/^(\{[^}]*\})/);
    if (! packageMatch) {
      // shouldn't happen.  all filenames less ever sees should involve this {}
      // thing!
      throw new Error("file without Meteor context? " + currentDirectory);
    }
    var currentPackagePrefix = packageMatch[1];

    var resolvedFilename;
    if (filename[0] === '/') {
      // Map `/foo/bar.less` onto `{thispackage}/foo/bar.less`
      resolvedFilename = currentPackagePrefix + filename;
    } else if (filename[0] === '{') {
      resolvedFilename = filename;
    } else {
      resolvedFilename = path.join(currentDirectory, filename);
    }
    if (! _.has(self.filesByAbsoluteImportPath, resolvedFilename)) {
      cb({type: "File", message: "Unknown import: " + filename});
      return;
    }
    cb(null, {
      contents: self.filesByAbsoluteImportPath[resolvedFilename]
        .getContentsAsBuffer().toString('utf8'),
      filename: resolvedFilename
    });
    return;
  }
});

function sourceMapLength(sm) {
  if (! sm) return 0;
  // sum the length of sources and the mappings, the size of
  // metadata is ignored, but it is not a big deal
  return sm.mappings.length
       + (sm.sourcesContent || []).reduce(function (soFar, current) {
         return soFar + (current ? current.length : 0);
       }, 0);
};
