var fs = Plugin.fs;
var path = Plugin.path;

Plugin.registerCompiler({
  extensions: ['printme'],
  archMatching: 'os'
}, function () {
  return new PrintmeCompiler();
});

var PrintmeCompiler = function () {
  var self = this;
  self.runCount = 0;
  self.diskCache = null;
};
PrintmeCompiler.prototype.processFilesForTarget = function (inputFiles) {
  var self = this;
  inputFiles.forEach(function (inputFile) {
    var source = inputFile.getContentsAsString();
    inputFile.addJavaScript({
      path: inputFile.getPathInPackage() + ".js",
      sourcePath: inputFile.getPathInPackage(),
      data: "console.log('PMC: ' + " + JSON.stringify(source) + ");\n"
    });
  });
  console.log("PrintmeCompiler invocation", ++self.runCount);
  if (self.diskCache) {
    fs.writeFileSync(self.diskCache, self.runCount + '\n');
  }
};
PrintmeCompiler.prototype.setDiskCacheDirectory = function (diskCacheDir) {
  var self = this;
  self.diskCache = path.join(diskCacheDir, 'cache');
  try {
    var data = fs.readFileSync(self.diskCache, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw e;
    return;
  }
  self.runCount = parseInt(data, 10);
};
