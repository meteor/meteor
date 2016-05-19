/**
 * A compiler that can be instantiated with features and used inside
 * Plugin.registerCompiler
 * @param {Object} extraFeatures The same object that getDefaultOptions takes
 */
BabelCompiler = function BabelCompiler(extraFeatures) {
  this.extraFeatures = extraFeatures;
};

var BCp = BabelCompiler.prototype;
var excludedFileExtensionPattern = /\.es5\.js$/i;

var strictModulesPluginFactory =
  Npm.require("babel-plugin-transform-es2015-modules-commonjs");

var babelModulesPlugin = [function () {
  var plugin = strictModulesPluginFactory.apply(this, arguments);
  // Since babel-preset-meteor uses an exact version of the
  // babel-plugin-transform-es2015-modules-commonjs transform (6.8.0), we
  // can be sure this plugin.inherits property is indeed the
  // babel-plugin-transform-strict-mode transform that we wish to disable.
  // Otherwise it would be difficult to know exactly what we're deleting
  // here, since plugins don't provide much identifying information.
  delete plugin.inherits;
  return plugin;
}, {
  allowTopLevelThis: true,
  strict: false,
  loose: true
}];

BCp.processFilesForTarget = function (inputFiles) {
  var self = this;

  inputFiles.forEach(function (inputFile) {
    var source = inputFile.getContentsAsString();
    var packageName = inputFile.getPackageName();
    var inputFilePath = inputFile.getPathInPackage();
    var outputFilePath = inputFilePath;
    var fileOptions = inputFile.getFileOptions();
    var toBeAdded = {
      sourcePath: inputFilePath,
      path: outputFilePath,
      data: source,
      hash: inputFile.getSourceHash(),
      sourceMap: null,
      bare: !! fileOptions.bare
    };

    // If you need to exclude a specific file within a package from Babel
    // compilation, pass the { transpile: false } options to api.addFiles
    // when you add that file.
    if (fileOptions.transpile !== false &&
        // If you need to exclude a specific file within an app from Babel
        // compilation, give it the following file extension: .es5.js
        ! excludedFileExtensionPattern.test(inputFilePath)) {

      var targetCouldBeInternetExplorer8 =
        inputFile.getArch() === "web.browser";

      self.extraFeatures = self.extraFeatures || {};
      if (! self.extraFeatures.hasOwnProperty("jscript")) {
        // Perform some additional transformations to improve
        // compatibility in older browsers (e.g. wrapping named function
        // expressions, per http://kiro.me/blog/nfe_dilemma.html).
        self.extraFeatures.jscript = targetCouldBeInternetExplorer8;
      }

      var babelOptions = Babel.getDefaultOptions(self.extraFeatures);

      if (inputFile.isPackageFile()) {
        // When compiling package files, handle import/export syntax using
        // the official Babel plugin, so that package authors won't
        // publish code that relies on module.import and module.export,
        // because such code would fail on Meteor versions before 1.3.3.
        // When compiling application files, however, it's fine to rely on
        // module.import and module.export, and the developer experience
        // will be much better for it: faster compilation, real variables,
        // import statements inside conditional statements, etc.
        //
        // TODO Remove this once we are confident enough developers have
        // updated to a version of Meteor that supports module.import and
        // module.export.
        babelOptions.plugins.push(babelModulesPlugin);
      }

      inferExtraBabelOptions(inputFile, babelOptions);

      babelOptions.sourceMap = true;
      babelOptions.filename =
      babelOptions.sourceFileName = packageName
        ? "/packages/" + packageName + "/" + inputFilePath
        : "/" + inputFilePath;

      babelOptions.sourceMapTarget = babelOptions.filename + ".map";

      try {
        var result = profile('Babel.compile', function () {
          return Babel.compile(source, babelOptions);
        });
      } catch (e) {
        if (e.loc) {
          inputFile.error({
            message: e.message,
            line: e.loc.line,
            column: e.loc.column,
          });

          return;
        }

        throw e;
      }

      toBeAdded.data = result.code;
      toBeAdded.hash = result.hash;
      toBeAdded.sourceMap = result.map;
    }

    inputFile.addJavaScript(toBeAdded);
  });
};

BCp.setDiskCacheDirectory = function (cacheDir) {
  Babel.setCacheDir(cacheDir);
};

function profile(name, func) {
  if (typeof Profile !== 'undefined') {
    return Profile.time(name, func);
  } else {
    return func();
  }
};

function inferExtraBabelOptions(inputFile, babelOptions) {
  const pkgJson =
    inputFile.require &&
    inputFile.getPathInPackage &&
    inputFile.getPackageJson();

  if (! pkgJson || ! pkgJson.babel) {
    return;
  }

  function infer(listName, prefix) {
    const list = pkgJson.babel[listName];
    if (! Array.isArray(list)) {
      return;
    }

    function addPrefix(id) {
      return isTopLevel ? prefix + id : id;
    }

    function req(id) {
      const isTopLevel = "./".indexOf(id.charAt(0)) < 0;
      if (isTopLevel) {
        // If the identifier is top-level, it will be prefixed with
        // "babel-plugin-" or "babel-preset-". If the identifier is not
        // top-level, but relative or absolute, then it will be required
        // as-is, so that you can implement your own Babel plugins
        // locally, rather than always using plugins installed from npm.
        id = prefix + id;
      }
      return inputFile.require(id);
    }

    list.forEach(function (item) {
      if (typeof item === "string") {
        item = req(item);
      } else if (Array.isArray(item) &&
                 typeof item[0] === "string") {
        item[0] = req(item[0]);
      }
      babelOptions[listName].push(item);
    });
  }

  infer("presets", "babel-preset-");
  infer("plugins", "babel-plugin-");
}
