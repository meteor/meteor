var util = Npm.require('util');
var Future = Npm.require('fibers/future');
var path = Npm.require('path');
var jshint = Npm.require('jshint').JSHINT;

Plugin.registerLinter({
  extensions: ["jshintrc", "js"],
}, function () {
  var linter = new JsHintLinter();
  return linter;
});

function JsHintLinter () {
  this.hashDict = {};
  this.cachedErrors = {};
};

JsHintLinter.prototype.processFilesForTarget = function (files, options) {
  var self = this;
  var globals = options.globals;

  var conf = {
    undef: true,
    unused: true,
    node: true,
    browser: true
  };

  files.forEach(function (file) {
    // find the config file
    if (file.getBasename() === '.jshintrc') {
      var confStr = file.getContentsAsString();
      try {
        conf = JSON.parse(confStr);
      } catch (err) {
        file.error({ message: "Failed to parse .jshint file, not a valid JSON: " + err.message });
      }
      return;
    }
    // require configuration file to be called '.jshintrc'
    if (path.extname(file.getBasename()) !== '.js') {
      file.error({ message: "Unrecognized configuration file name. Configuration file should be called .jshintrc" });
      return;
    }
  });

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
    var hashKey = JSON.stringify([
      file.getPackageName(), file.getPathInPackage(), file.getArch()]);

    // XXX a memory leak for removed files? A cached errors object would be
    // stored for it indefinitely
    if (self.hashDict[hashKey] === file.getSourceHash()) {
      reportErrors(file, self.cachedErrors[hashKey]);
      return;
    }

    self.hashDict[hashKey] = file.getSourceHash();

    if (! jshint(file.getContentsAsString(), conf, predefinedGlobals)) {
      reportErrors(file, jshint.errors);
      self.cachedErrors[hashKey] = jshint.errors;
    } else {
      self.cachedErrors[hashKey] = [];
    }
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

