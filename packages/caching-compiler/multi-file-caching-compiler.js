const path = Plugin.path;
const Future = Npm.require('fibers/future');
const LRU = Npm.require('lru-cache');
const async = Npm.require('async');

// MultiFileCachingCompiler is like CachingCompiler, but for implementing
// languages which allow files to reference each other, such as CSS
// preprocessors with `@import` directives.
//
// Like CachingCompiler, you should subclass MultiFileCachingCompiler and define
// the following methods: getCacheKey, compileOneFile, addCompileResult, and
// compileResultSize.  compileOneFile gets an additional allFiles argument and
// returns an array of referenced import paths in addition to the CompileResult.
// You may also override isRoot and getAbsoluteImportPath to customize
// MultiFileCachingCompiler further.
MultiFileCachingCompiler = class MultiFileCachingCompiler
extends CachingCompilerBase {
  constructor({
    compilerName,
    defaultCacheSize,
    maxParallelism
  }) {
    super({compilerName, defaultCacheSize, maxParallelism});

    // Maps from cache key to { compileResult, cacheKeys }, where
    // cacheKeys is an object mapping from absolute import path to hashed
    // cacheKey for each file referenced by this file (including itself).
    this._cache = new LRU({
      max: this._cacheSize,
      // We ignore the size of cacheKeys here.
      length: (value) => this.compileResultSize(value.compileResult),
    });
  }

  // Your subclass must override this method to define the transformation from
  // InputFile to its cacheable CompileResult).
  //
  // Arguments:
  //   - inputFile is the InputFile to process
  //   - allFiles is a a Map mapping from absolute import path to InputFile of
  //     all files being processed in the target
  // Returns an object with keys:
  //   - compileResult: the CompileResult (the cacheable data type specific to
  //     your subclass).
  //   - referencedImportPaths: an array of absolute import paths of files
  //     which were refererenced by the current file.  The current file
  //     is included implicitly.
  //
  // This method is not called on files when a valid cache entry exists in
  // memory or on disk.
  //
  // On a compile error, you should call `inputFile.error` appropriately and
  // return null; this will not be cached.
  //
  // This method should not call `inputFile.addJavaScript` and similar files!
  // That's what addCompileResult is for.
  compileOneFile(inputFile, allFiles) {
    throw Error(
      'MultiFileCachingCompiler subclass should implement compileOneFile!');
  }

  // Your subclass may override this to declare that a file is not a "root" ---
  // ie, it can be included from other files but is not processed on its own. In
  // this case, MultiFileCachingCompiler won't waste time trying to look for a
  // cache for its compilation on disk.
  isRoot(inputFile) {
    return true;
  }

  // Returns the absolute import path for an InputFile. By default, this is a
  // path is a path of the form "{package}/path/to/file" for files in packages
  // and "{}/path/to/file" for files in apps. Your subclass may override and/or
  // call this method.
  getAbsoluteImportPath(inputFile) {
    if (inputFile.getPackageName() === null) {
      return '{}/' + inputFile.getPathInPackage();
    }
    return '{' + inputFile.getPackageName() + '}/'
      + inputFile.getPathInPackage();
  }

  // The processFilesForTarget method from the Plugin.registerCompiler API.
  processFilesForTarget(inputFiles) {
    const allFiles = new Map;
    const cacheKeyMap = new Map;
    const cacheMisses = [];
    const arches = this._cacheDebugEnabled && Object.create(null);

    inputFiles.forEach((inputFile) => {
      const importPath = this.getAbsoluteImportPath(inputFile);
      allFiles.set(importPath, inputFile);
      cacheKeyMap.set(importPath, this._getCacheKeyWithPath(inputFile));
    });

    const allProcessedFuture = new Future;
    async.eachLimit(inputFiles, this._maxParallelism, (inputFile, cb) => {
      if (arches) {
        arches[inputFile.getArch()] = 1;
      }

      let error = null;
      try {
        // If this isn't a root, skip it (and definitely don't waste time
        // looking for a cache file that won't be there).
        if (!this.isRoot(inputFile)) {
          return;
        }

        const absoluteImportPath = this.getAbsoluteImportPath(inputFile);
        const cacheKey = cacheKeyMap.get(absoluteImportPath);
        let cacheEntry = this._cache.get(cacheKey);
        if (! cacheEntry) {
          cacheEntry = this._readCache(cacheKey);
          if (cacheEntry) {
            this._cacheDebug(`Loaded ${ absoluteImportPath }`);
          }
        }

        if (! (cacheEntry && this._cacheEntryValid(cacheEntry, cacheKeyMap))) {
          cacheMisses.push(inputFile.getDisplayPath());

          const compileOneFileReturn = this.compileOneFile(inputFile, allFiles);
          if (! compileOneFileReturn) {
            // compileOneFile should have called inputFile.error.
            //  We don't cache failures for now.
            return;
          }
          const {compileResult, referencedImportPaths} = compileOneFileReturn;

          cacheEntry = {
            compileResult,
            cacheKeys: {
              // Include the hashed cache key of the file itself...
              [absoluteImportPath]: cacheKeyMap.get(absoluteImportPath)
            }
          };

          // ... and of the other referenced files.
          referencedImportPaths.forEach((path) => {
            if (!cacheKeyMap.has(path)) {
              throw Error(`Unknown absolute import path ${ path }`);
            }
            cacheEntry.cacheKeys[path] = cacheKeyMap.get(path);
          });

          // Save the cache entry.
          this._cache.set(cacheKey, cacheEntry);
          this._writeCacheAsync(cacheKey, cacheEntry);
        }

        this.addCompileResult(inputFile, cacheEntry.compileResult);
      } catch (e) {
        error = e;
      } finally {
        cb(error);
      }
    }, allProcessedFuture.resolver());
    allProcessedFuture.wait();

    if (this._cacheDebugEnabled) {
      cacheMisses.sort();
      this._cacheDebug(
        `Ran (#${
          ++this._callCount
        }) on: ${
          JSON.stringify(cacheMisses)
        } ${
          JSON.stringify(Object.keys(arches).sort())
        }`);
    }
  }

  // Returns a hash that incorporates both this.getCacheKey(inputFile) and
  // this.getAbsoluteImportPath(inputFile), since the file path might be
  // relevant to the compiled output when using MultiFileCachingCompiler.
  _getCacheKeyWithPath(inputFile) {
    return this._deepHash([
      this.getAbsoluteImportPath(inputFile),
      this.getCacheKey(inputFile),
    ]);
  }

  _cacheEntryValid(cacheEntry, cacheKeyMap) {
    return Object.keys(cacheEntry.cacheKeys).every(
      (path) => cacheEntry.cacheKeys[path] === cacheKeyMap.get(path)
    );
  }

  // The format of a cache file on disk is the JSON-stringified cacheKeys
  // object, a newline, followed by the CompileResult as returned from
  // this.stringifyCompileResult.
  _cacheFilename(cacheKey) {
    return path.join(this._diskCache, cacheKey + ".cache");
  }

  // Loads a {compileResult, cacheKeys} cache entry from disk. Returns the whole
  // cache entry and loads it into the in-memory cache too.
  _readCache(cacheKey) {
    if (! this._diskCache) {
      return null;
    }
    const cacheFilename = this._cacheFilename(cacheKey);
    const raw = this._readFileOrNull(cacheFilename);
    if (!raw) {
      return null;
    }

    // Split on newline.
    const newlineIndex = raw.indexOf('\n');
    if (newlineIndex === -1) {
      return null;
    }
    const cacheKeysString = raw.substring(0, newlineIndex);
    const compileResultString = raw.substring(newlineIndex + 1);

    const cacheKeys = this._parseJSONOrNull(cacheKeysString);
    if (!cacheKeys) {
      return null;
    }
    const compileResult = this.parseCompileResult(compileResultString);
    if (! compileResult) {
      return null;
    }

    const cacheEntry = {compileResult, cacheKeys};
    this._cache.set(cacheKey, cacheEntry);
    return cacheEntry;
  }

  _writeCacheAsync(cacheKey, cacheEntry) {
    if (! this._diskCache) {
      return null;
    }
    const cacheFilename = this._cacheFilename(cacheKey);
    const cacheContents =
      JSON.stringify(cacheEntry.cacheKeys) + '\n' +
      this.stringifyCompileResult(cacheEntry.compileResult);
    this._writeFileAsync(cacheFilename, cacheContents);
  }
}
