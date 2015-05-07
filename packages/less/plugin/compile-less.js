var less = Npm.require('less');
var util = Npm.require('util');
var path = Npm.require('path');
var Future = Npm.require('fibers/future');

Plugin.registerCompiler({
  extensions: ['less'],
  archMatching: 'web'
}, function () {
    return new LessCompiler;
});

var LessCompiler = function () {
};
LessCompiler.prototype.processFilesForTarget = function (inputFiles) {
  var filesByAbsoluteImportPath = {};
  var mains = [];

  inputFiles.forEach(function (inputFile) {
    var packageName = inputFile.getPackageName();
    var pathInPackage = inputFile.getPathInPackage();
    // XXX BBP think about windows slashes
    var absoluteImportPath = packageName === null
          ? ('{}/' + pathInPackage)
          : ('{' + packageName + '}/' + pathInPackage);
    filesByAbsoluteImportPath[absoluteImportPath] = inputFile;
    if (pathInPackage.match(/\.main\.less$/)) {
      mains.push({inputFile: inputFile,
                  absoluteImportPath: absoluteImportPath});
    }
  });

  var importPlugin = new MeteorImportLessPlugin(filesByAbsoluteImportPath);

  _.each(mains, function (main) {
    var inputFile = main.inputFile;
    var absoluteImportPath = main.absoluteImportPath;
    var f = new Future;
    less.render(inputFile.getContentsAsBuffer().toString('utf8'), {
      filename: absoluteImportPath,
      plugins: [importPlugin],
      // Generate a source map, and include the source files in the
      // sourcesContent field.  (Note that source files which don't themselves
      // produce text (eg, are entirely variable definitions) won't end up in
      // the source map!)
      sourceMap: { outputSourceFiles: true }
    }, f.resolver());
    try {
      var output = f.wait();
    } catch (e) {
      inputFile.error({
        message: e.message,
        sourcePath: e.filename,  // XXX BBP this has {} and stuff, is that OK?
        line: e.line,
        column: e.column
      });
      return;  // go on to next file
    }

    // XXX BBP note that output.imports has a list of imports, which can
    //     be used for caching
    inputFile.addStylesheet({
      data: output.css,
      path: inputFile.getPathInPackage() + '.css',
      sourceMap: output.map
    });
  });
};

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

    if (filename[0] === '/') {
      // Map `/foo/bar.less` onto `{thispackage}/foo/bar.less`
      filename = currentPackagePrefix + filename;
    } else if (filename[0] !== '{') {
      filename = path.join(currentDirectory, filename);
    }
    if (! _.has(self.filesByAbsoluteImportPath, filename)) {
      // XXX BBP better error handling?
      cb({type: "File", message: "Unknown import: " + filename});
      return;
    }
    cb(null, {
      contents: self.filesByAbsoluteImportPath[filename]
        .getContentsAsBuffer().toString('utf8'),
      filename: filename
    });
    return;
  }
});
