Plugin.registerMinifier({
  extensions: ["js"]
}, function () {
  var minifier = new CustomMinifier('js');
  return minifier;
});

Plugin.registerMinifier({
  extensions: ["css"]
}, function () {
  var minifier = new CustomMinifier('css');
  return minifier;
});

function CustomMinifier(type) {
  this.type = type;
};

CustomMinifier.prototype.processFilesForBundle = function (files, options) {
  var self = this;
  var mode = options.minifyMode;

  files.forEach(function (file) {
    var contents =
      file.getContentsAsString().replace(/foo/g, mode + '_' + self.type);

    if (self.type === 'js') {
      file.addJavaScript({
        data: contents
      });
    } else {
      file.addStylesheet({
        data: contents
      });
    }

    Plugin.nudge();
  });
};


