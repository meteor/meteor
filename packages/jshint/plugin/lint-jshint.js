/* globals Npm, Plugin */

var jshint = Npm.require('jshint').JSHINT;

Plugin.registerLinter({
  extensions: ["js"],
  filenames: [".jshintrc"]
}, function () {
  var linter = new JsHintLinter();
  return linter;
});

function JsHintLinter () {
  // packageName -> { config (json),
  //                  files: { [pathInPackage,arch] -> { hash, errors }}}
  this._cacheByPackage = {};
}

var DEFAULT_CONFIG = JSON.stringify({
  undef: true,
  unused: true,
  node: true,
  browser: true
});

JsHintLinter.prototype.processFilesForPackage = function (files, options) {
  var self = this;
  var globals = options.globals;

  // Assumes that this method gets called once per package.
  var packageName = files[0].getPackageName();
  if (! self._cacheByPackage.hasOwnProperty(packageName)) {
    self._cacheByPackage[packageName] = {
      configString: DEFAULT_CONFIG,
      files: {}
    };
  }
  var cache = self._cacheByPackage[packageName];

  var configs = files.filter(function (file) {
    return file.getBasename() === '.jshintrc';
  });
  if (configs.length > 1) {
    configs[0].error({
      message: "Found multiple .jshintrc files in package " + packageName +
        ": " +
        configs.map(function (c) { return c.getPathInPackage(); }).join(', ')
    });
    return;
  }

  if (configs.length) {
    var newConfigString = configs[0].getContentsAsString();
    if (cache.configString !== newConfigString) {
      // Reset cache.
      cache.files = {};
      cache.configString = newConfigString;
    }
  } else {
    if (cache.configString !== DEFAULT_CONFIG) {
      // Reset cache.
      cache.files = {};
      cache.configString = DEFAULT_CONFIG;
    }
  }

  try {
    var config = JSON.parse(cache.configString);
  } catch (err) {
    // This should really not happen for DEFAULT_CONFIG :)
    configs[0].error({
      message: "Failed to parse " + configs[0].getPathInPackage() +
        ": not valid JSON: " + err.message
    });
    return;
  }

  // JSHint has a particular format for defining globals. `false` means that the
  // global is not allowed to be redefined. `true` means it is allowed to be
  // redefined. Since the passed imports are probably not great for definition,
  // mark them as false.
  var predefinedGlobals = {};
  globals.forEach(function (symbol) {
    predefinedGlobals[symbol] = false;
  });

  files.forEach(function (file) {
    if (file.getBasename() === '.jshintrc')
      return;

    // skip files we already linted
    var cacheKey = JSON.stringify([file.getPathInPackage(), file.getArch()]);
    if (cache.files.hasOwnProperty(cacheKey) &&
        cache.files[cacheKey].hash === file.getSourceHash()) {
      reportErrors(file, cache.files[cacheKey].errors);
      return;
    }

    var errors = [];
    if (! jshint(file.getContentsAsString(), config, predefinedGlobals)) {
      errors = jshint.errors;
      reportErrors(file, errors);
    }
    cache.files[cacheKey] = { hash: file.getSourceHash(), errors: errors };
  });

  function reportErrors(file, errors) {
    errors.forEach(function (error) {
      file.error({
        message: error.reason,
        line: error.line,
        column: error.character
      });
    });
  }
};
