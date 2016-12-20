const fs = Plugin.fs;
const path = Plugin.path;
const createHash = Npm.require('crypto').createHash;
const assert = Npm.require('assert');
const Future = Npm.require('fibers/future');
const LRU = Npm.require('lru-cache');
const async = Npm.require('async');

// Base class for CachingCompiler and MultiFileCachingCompiler.
CachingCompilerBase = class CachingCompilerBase {
  constructor({
    compilerName,
    defaultCacheSize,
    maxParallelism = 20,
  }) {
    this._compilerName = compilerName;
    this._maxParallelism = maxParallelism;
    const envVarPrefix = 'METEOR_' + compilerName.toUpperCase() + '_CACHE_';

    const debugEnvVar = envVarPrefix + 'DEBUG';
    this._cacheDebugEnabled = !! process.env[debugEnvVar];

    const cacheSizeEnvVar = envVarPrefix + 'SIZE';
    this._cacheSize = +process.env[cacheSizeEnvVar] || defaultCacheSize;

    this._diskCache = null;

    // For testing.
    this._callCount = 0;
  }

  // Your subclass must override this method to define the key used to identify
  // a particular version of an InputFile.
  //
  // Given an InputFile (the data type passed to processFilesForTarget as part
  // of the Plugin.registerCompiler API), returns a cache key that represents
  // it. This cache key can be any JSON value (it will be converted internally
  // into a hash).  This should reflect any aspect of the InputFile that affects
  // the output of `compileOneFile`. Typically you'll want to include
  // `inputFile.getDeclaredExports()`, and perhaps
  // `inputFile.getPathInPackage()` or `inputFile.getDeclaredExports` if
  // `compileOneFile` pays attention to them.
  //
  // Note that for MultiFileCachingCompiler, your cache key doesn't need to
  // include the file's path, because that is automatically taken into account
  // by the implementation. CachingCompiler subclasses can choose whether or not
  // to include the file's path in the cache key.
  getCacheKey(inputFile) {
    throw Error('CachingCompiler subclass should implement getCacheKey!');
  }

  // Your subclass must override this method to define how a CompileResult
  // translates into adding assets to the bundle.
  //
  // This method is given an InputFile (the data type passed to
  // processFilesForTarget as part of the Plugin.registerCompiler API) and a
  // CompileResult (either returned directly from compileOneFile or read from
  // the cache).  It should call methods like `inputFile.addJavaScript`
  // and `inputFile.error`.
  addCompileResult(inputFile, compileResult) {
    throw Error('CachingCompiler subclass should implement addCompileResult!');
  }

  // Your subclass must override this method to define the size of a
  // CompilerResult (used by the in-memory cache to limit the total amount of
  // data cached).
  compileResultSize(compileResult) {
    throw Error('CachingCompiler subclass should implement compileResultSize!');
  }

  // Your subclass may override this method to define an alternate way of
  // stringifying CompilerResults.  Takes a CompileResult and returns a string.
  stringifyCompileResult(compileResult) {
    return JSON.stringify(compileResult);
  }
  // Your subclass may override this method to define an alternate way of
  // parsing CompilerResults from string.  Takes a string and returns a
  // CompileResult.  If the string doesn't represent a valid CompileResult, you
  // may want to return null instead of throwing, which will make
  // CachingCompiler ignore the cache.
  parseCompileResult(stringifiedCompileResult) {
    return this._parseJSONOrNull(stringifiedCompileResult);
  }
  _parseJSONOrNull(json) {
    try {
      return JSON.parse(json);
    } catch (e) {
      if (e instanceof SyntaxError)
        return null;
      throw e;
    }
  }

  _cacheDebug(message) {
    if (!this._cacheDebugEnabled)
      return;
    console.log(`CACHE(${ this._compilerName }): ${ message }`);
  }

  setDiskCacheDirectory(diskCache) {
    if (this._diskCache)
      throw Error('setDiskCacheDirectory called twice?');
    this._diskCache = diskCache;
  }

  // Since so many compilers will need to calculate the size of a SourceMap in
  // their compileResultSize, this method is provided.
  sourceMapSize(sm) {
    if (! sm) return 0;
    // sum the length of sources and the mappings, the size of
    // metadata is ignored, but it is not a big deal
    return sm.mappings.length
      + (sm.sourcesContent || []).reduce(function (soFar, current) {
        return soFar + (current ? current.length : 0);
      }, 0);
  }

  // Borrowed from another MIT-licensed project that benjamn wrote:
  // https://github.com/reactjs/commoner/blob/235d54a12c/lib/util.js#L136-L168
  _deepHash(val) {
    const hash = createHash('sha1');
    let type = typeof val;

    if (val === null) {
      type = 'null';
    }
    hash.update(type + '\0');

    switch (type) {
    case 'object':
      const keys = Object.keys(val);

      // Array keys will already be sorted.
      if (! Array.isArray(val)) {
        keys.sort();
      }

      keys.forEach((key) => {
        if (typeof val[key] === 'function') {
          // Silently ignore nested methods, but nevertheless complain below
          // if the root value is a function.
          return;
        }

        hash.update(key + '\0').update(this._deepHash(val[key]));
      });

      break;

    case 'function':
      assert.ok(false, 'cannot hash function objects');
      break;

    default:
      hash.update('' + val);
      break;
    }

    return hash.digest('hex');
  }

  // We want to write the file atomically. But we also don't want to block
  // processing on the file write.
  _writeFileAsync(filename, contents) {
    const tempFilename = filename + '.tmp.' + Random.id();
    if (this._cacheDebugEnabled) {
      // Write cache file synchronously when cache debugging enabled.
      try {
        fs.writeFileSync(tempFilename, contents);
        fs.renameSync(tempFilename, filename);
      } catch (e) {
        // ignore errors, it's just a cache
      }
    } else {
      fs.writeFile(tempFilename, contents, err => {
        // ignore errors, it's just a cache
        if (! err) {
          fs.rename(tempFilename, filename, err => {});
        }
      });
    }
  }

  // Helper function. Returns the body of the file as a string, or null if it
  // doesn't exist.
  _readFileOrNull(filename) {
    try {
      return fs.readFileSync(filename, 'utf8');
    } catch (e) {
      if (e && e.code === 'ENOENT')
        return null;
      throw e;
    }
  }
}

// CachingCompiler is a class designed to be used with Plugin.registerCompiler
// which implements in-memory and on-disk caches for the files that it
// processes.  You should subclass CachingCompiler and define the following
// methods: getCacheKey, compileOneFile, addCompileResult, and
// compileResultSize.
//
// CachingCompiler assumes that files are processed independently of each other;
// there is no 'import' directive allowing one file to reference another.  That
// is, editing one file should only require that file to be rebuilt, not other
// files.
//
// The data that is cached for each file is of a type that is (implicitly)
// defined by your subclass. CachingCompiler refers to this type as
// `CompileResult`, but this isn't a single type: it's up to your subclass to
// decide what type of data this is.  You should document what your subclass's
// CompileResult type is.
//
// Your subclass's compiler should call the superclass compiler specifying the
// compiler name (used to generate environment variables for debugging and
// tweaking in-memory cache size) and the default cache size.
//
// By default, CachingCompiler processes each file in "parallel". That is, if it
// needs to yield to read from the disk cache, or if getCacheKey,
// compileOneFile, or addCompileResult yields, it will start processing the next
// few files. To set how many files can be processed in parallel (including
// setting it to 1 if your subclass doesn't support any parallelism), pass the
// maxParallelism option to the superclass constructor.
//
// For example (using ES2015 via the ecmascript package):
//
//   class AwesomeCompiler extends CachingCompiler {
//     constructor() {
//       super({
//         compilerName: 'awesome',
//         defaultCacheSize: 1024*1024*10,
//       });
//     }
//     // ... define the other methods
//   }
//   Plugin.registerCompile({
//     extensions: ['awesome'],
//   }, () => new AwesomeCompiler());
//
// XXX maybe compileResultSize and stringifyCompileResult should just be methods
// on CompileResult? Sort of hard to do that with parseCompileResult.
CachingCompiler = class CachingCompiler extends CachingCompilerBase {
  constructor({
    compilerName,
    defaultCacheSize,
    maxParallelism = 20,
  }) {
    super({compilerName, defaultCacheSize, maxParallelism});

    // Maps from a hashed cache key to a compileResult.
    this._cache = new LRU({
      max: this._cacheSize,
      length: (value) => this.compileResultSize(value),
    });
  }

  // Your subclass must override this method to define the transformation from
  // InputFile to its cacheable CompileResult).
  //
  // Given an InputFile (the data type passed to processFilesForTarget as part
  // of the Plugin.registerCompiler API), compiles the file and returns a
  // CompileResult (the cacheable data type specific to your subclass).
  //
  // This method is not called on files when a valid cache entry exists in
  // memory or on disk.
  //
  // On a compile error, you should call `inputFile.error` appropriately and
  // return null; this will not be cached.
  //
  // This method should not call `inputFile.addJavaScript` and similar files!
  // That's what addCompileResult is for.
  compileOneFile(inputFile) {
    throw Error('CachingCompiler subclass should implement compileOneFile!');
  }

  // The processFilesForTarget method from the Plugin.registerCompiler API. If
  // you have processing you want to perform at the beginning or end of a
  // processing phase, you may want to override this method and call the
  // superclass implementation from within your method.
  processFilesForTarget(inputFiles) {
    const cacheMisses = [];

    const future = new Future;
    async.eachLimit(inputFiles, this._maxParallelism, (inputFile, cb) => {
      let error = null;
      try {
        const cacheKey = this._deepHash(this.getCacheKey(inputFile));
        let compileResult = this._cache.get(cacheKey);

        if (! compileResult) {
          compileResult = this._readCache(cacheKey);
          if (compileResult) {
            this._cacheDebug(`Loaded ${ inputFile.getDisplayPath() }`);
          }
        }

        if (! compileResult) {
          cacheMisses.push(inputFile.getDisplayPath());
          compileResult = this.compileOneFile(inputFile);

          if (! compileResult) {
            // compileOneFile should have called inputFile.error.
            //  We don't cache failures for now.
            return;
          }

          // Save what we've compiled.
          this._cache.set(cacheKey, compileResult);
          this._writeCacheAsync(cacheKey, compileResult);
        }

        this.addCompileResult(inputFile, compileResult);
      } catch (e) {
        error = e;
      } finally {
        cb(error);
      }
    }, future.resolver());
    future.wait();

    if (this._cacheDebugEnabled) {
      cacheMisses.sort();
      this._cacheDebug(
        `Ran (#${ ++this._callCount }) on: ${ JSON.stringify(cacheMisses) }`);
    }
  }

  _cacheFilename(cacheKey) {
    // We want cacheKeys to be hex so that they work on any FS and never end in
    // .cache.
    if (!/^[a-f0-9]+$/.test(cacheKey)) {
      throw Error('bad cacheKey: ' + cacheKey);
    }
    return path.join(this._diskCache, cacheKey + '.cache');
  }
  // Load a cache entry from disk. Returns the compileResult object
  // and loads it into the in-memory cache too.
  _readCache(cacheKey) {
    if (! this._diskCache) {
      return null;
    }
    const cacheFilename = this._cacheFilename(cacheKey);
    const compileResult = this._readAndParseCompileResultOrNull(cacheFilename);
    if (! compileResult) {
      return null;
    }
    this._cache.set(cacheKey, compileResult);
    return compileResult;
  }
  _writeCacheAsync(cacheKey, compileResult) {
    if (! this._diskCache)
      return;
    const cacheFilename = this._cacheFilename(cacheKey);
    const cacheContents = this.stringifyCompileResult(compileResult);
    this._writeFileAsync(cacheFilename, cacheContents);
  }

  // Returns null if the file does not exist or can't be parsed; otherwise
  // returns the parsed compileResult in the file.
  _readAndParseCompileResultOrNull(filename) {
    const raw = this._readFileOrNull(filename);
    return this.parseCompileResult(raw);
  }
}
