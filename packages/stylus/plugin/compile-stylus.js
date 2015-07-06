var url = Npm.require('url');
var stylus = Npm.require('stylus');
var nib = Npm.require('nib');
var Future = Npm.require('fibers/future');
var LRU = Npm.require('lru-cache');

Plugin.registerCompiler({
  extensions: ['styl'],
  archMatchin: 'web'
}, function () {
  return new StylusCompiler();
});

var APP_SYMBOL = '__app__';

var CACHE_SIZE = process.env.METEOR_STYLUS_CACHE_SIZE || 1024*1024*10;

function StylusCompiler () {
  var self = this;

  self._cache = new LRU({
    max: CACHE_SIZE,
    // Cache is measured in bytes (not counting the hashes).
    length: function (value) {
      return value.css.length + sourceMapLength(value.sourceMap);
    }
  });

  self._diskCache = null;
}

StylusCompiler.prototype.processFilesForTarget = function (files) {
  var self = this;

  var currentlyCompiledFile = null;
  var currentlyCompiledPackage = null;
  var currentlyProcessedImports = null;
  var parseImportPath = function (filePath, importerPath) {
    if (filePath === currentlyCompiledFile) {
      return {
        packageName: currentlyCompiledPackage,
        pathInPackage: '/' + currentlyCompiledFile
      };
    }
    if (! filePath.match(/^\{.*\}\//)) {
      // relative path in the same package
      var parsedImporter = parseImportPath(importerPath, null);
      return {
        packageName: parsedImporter.packageName,
        pathInPackage: url.resolve(parsedImporter.pathInPackage, filePath)
      };
    }

    var match = /^(\{.*\})(\/.*)$/.exec(filePath);
    if (! match) { return null; }

    var packageName = match[1];
    if (!packageName || packageName === '{}')
      packageName = APP_SYMBOL;
    else
      packageName = packageName.substr(1, packageName.length - 2);

    var pathInPackage = match[2];

    return {packageName: packageName, pathInPackage: pathInPackage};
  };
  var absoluteImportPath = function (parsed) {
    return '{' + parsed.packageName + '}' + parsed.pathInPackage;
  };

  var filesByAbsoluteImportPath = {};
  files.forEach(function (inputFile) {
    var packageName = inputFile.getPackageName() || APP_SYMBOL;
    var filePath = '/' + inputFile.getPathInPackage();
    filesByAbsoluteImportPath[absoluteImportPath({
      packageName: packageName,
      pathInPackage: filePath
    })] = inputFile;
  });


  var importer = {
    find: function (importPath, paths, importerPath) {
      var parsed = parseImportPath(importPath, importerPath);

      if (! parsed) { return null; }

      var absolutePath = absoluteImportPath(parsed);

      if (! filesByAbsoluteImportPath[absolutePath]) {
        return null;
      }

      return [absolutePath];
    },
    readFile: function (filePath) {
      var parsed = parseImportPath(filePath);
      var absolutePath = absoluteImportPath(parsed);

      currentlyProcessedImports.push(absolutePath);

      return filesByAbsoluteImportPath[absolutePath].getContentsAsString();
    }
  };

  function processSourcemap(sourcemap) {
    delete sourcemap.file;
    sourcemap.sourcesContent = sourcemap.sources.map(importer.readFile);
    sourcemap.sources = sourcemap.sources.map(function (filePath) {
      var parsed = parseImportPath(filePath);
      if (parsed.packageName === APP_SYMBOL)
        return parsed.pathInPackage.substr(1);
      return 'packages/' + parsed.packageName + parsed.pathInPackage;
    });

    return sourcemap;
  }

  files.forEach(function (inputFile) {
    if (! inputFile.getPathInPackage().match(/\.main\.styl$/)) {
      return;
    }

    currentlyCompiledFile = inputFile.getPathInPackage();
    currentlyCompiledPackage = inputFile.getPackageName() || APP_SYMBOL;
    currentlyProcessedImports = [];

    var absolutePath = absoluteImportPath({
      packageName: currentlyCompiledPackage,
      filePath: currentlyCompiledFile
    });

    var cacheEntry = self._cache.get(absolutePath);
    if (! (cacheEntry && self._cacheEntryValid(cacheEntry, filesByAbsoluteImportPath))) {
      // the entry in the cache doesn't represent the latest state

      var f = new Future;
      var style = stylus(inputFile.getContentsAsString())
        .use(nib())
        .set('filename', inputFile.getPathInPackage())
        .set('sourcemap', { inline: false, comment: false })
        .set('importer', importer);

      style.render(f.resolver());

      try {
        var css = f.wait();
      } catch (e) {
        inputFile.error({
          message: "Stylus compiler error: " + e.message
        });
        return;
      }
      var sourcemap = processSourcemap(style.sourcemap);

      cacheEntry = {
        hashes: {},
        css: css,
        sourceMap: sourcemap
      };
      cacheEntry.hashes[absolutePath] = inputFile.getSourceHash();
      currentlyProcessedImports.forEach(function (path) {
        cacheEntry.hashes[path] =
          filesByAbsoluteImportPath[path].getSourceHash();
      });

      self._cache.set(absolutePath, cacheEntry);
    }

    inputFile.addStylesheet({
      path: inputFile.getPathInPackage() + ".css",
      data: cacheEntry.css,
      sourceMap: cacheEntry.sourceMap
    });
  });

  // Rewrite the cache to disk.
  // XXX BBP we should just write individual entries separately.
  self._writeCache();
};

StylusCompiler.prototype._cacheEntryValid = function (cacheEntry, filesMap) {
  return Object.keys(cacheEntry.hashes).every(function (path) {
    var hash = cacheEntry.hashes[path];
    return filesMap[path] && filesMap[path].getSourceHash() === hash;
  });
};

StylusCompiler.prototype._writeCache = function () {
  // XXX BBP no on-disk caching yet
};

function sourceMapLength(sm) {
  if (! sm) return 0;
  // sum the length of sources and the mappings, the size of
  // metadata is ignored, but it is not a big deal
  return sm.mappings.length
       + (sm.sourcesContent || []).reduce(function (soFar, current) {
         return soFar + (current ? current.length : 0);
       }, 0);
};
