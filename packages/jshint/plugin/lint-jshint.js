/* globals Npm, Plugin */

const jshint = Npm.require('jshint').JSHINT;

Plugin.registerLinter({
  extensions: ["js"],
  filenames: [".jshintrc"]
},
  () => new JsHintLinter()
);

const DEFAULT_CONFIG = JSON.stringify({
  undef: true,
  unused: true,
  node: true,
  browser: true,
});

class JsHintLinter {

  constructor() {
    // the cache has package names for keys and values that contain the configuration
    // for the application or package you are processing
    // packageName -> { config (json),
    //                  files: { [pathInPackage,arch] -> { hash, errors }}}
    this._cacheByPackage = {};
  }

  // this method gets called once per package and once for the app itself
  processFilesForPackage(files, options) {
    const globals = options.globals;
    const packageName = files[0].getPackageName();

    // populate the cache with an entry for this package (or for the app itself)
    // if one doesn't already exist
    if (!this._cacheByPackage.hasOwnProperty(packageName)) {
      this._cacheByPackage[packageName] = {
        configString: DEFAULT_CONFIG,
        files: {}
      };
    }

    // then access the cache entry for this package (or for the app itself)
    const cache = this._cacheByPackage[packageName];

    // get the config file if one exists
    const configs = files.filter(function (file) {
      return file.getBasename() === '.jshintrc';
    });

    // check for multiple config files, which is an error condition
    if (configs.length > 1) {
      configs[0].error({
        message: "Found multiple .jshintrc files in package " + packageName +
          ": " +
          configs.map(function (c) { return c.getPathInPackage(); }).join(', ')
      });
      return;
    }

    // if one config file is present then it will be used
    if (configs.length) {
      const newConfigString = configs[0].getContentsAsString();
      if (cache.configString !== newConfigString) {
        // Reset cache.
        cache.files = {};
        cache.configString = newConfigString;
      }
    }
    // if no config file is present then use the default config
    else {
      if (cache.configString !== DEFAULT_CONFIG) {
        // Reset cache.
        cache.files = {};
        cache.configString = DEFAULT_CONFIG;
      }
    }

    // attempt to parse the configuration file
    let config;
    try {
      config = JSON.parse(cache.configString);
    }
    catch (err) {
      // This should really not happen for DEFAULT_CONFIG :)
      configs[0].error({
        message: "Failed to parse " + configs[0].getPathInPackage() +
          ": not valid JSON: " + err.message
      });
      return;
    }

    // JSHint has a particular format for defining globals. `false` means that the
    // global is not allowed to be redefined. `true` means it is allowed to be
    // redefined. So we mark them all false so they are read-only.
    const predefinedGlobals = {};
    globals.forEach(function (symbol) {
      predefinedGlobals[symbol] = false;
    });

    // this is the loop where we process the javascript files in the app or package
    files.forEach(function (file) {

      // skip the config file
      if (file.getBasename() === '.jshintrc') return;

      const cacheKey = JSON.stringify([file.getPathInPackage(), file.getArch()]);

      // if the cache has an entry with that key and its hash is the same as the
      // hash of the file (meaning the file hasn't changed at all since that last time
      // the linter ran)
      if (cache.files.hasOwnProperty(cacheKey) &&
        cache.files[cacheKey].hash === file.getSourceHash()) {
        // since the file hasn't changed we can report the errors found the last time
        // the plugin ran
        reportErrors(file, cache.files[cacheKey].errors);
        return;
      }

      // this is the case where we need to process the file and report newly found errors
      let errors = [];
    
      // this is where we actually use jshint
      if (!jshint(file.getContentsAsString(), config, predefinedGlobals)) {
        errors = jshint.errors;        
        reportErrors(file, errors);
      }

      // add the newly processed file into the cache
      cache.files[cacheKey] = { hash: file.getSourceHash(), errors: errors };
    });

    function reportErrors(file, errors) {
      errors.forEach(function (error) {        
        file.error({
          message: error.reason,
          line: error.line,
          column: error.character,
        });
      });
    }
  }
}
