Plugin.registerMinifier({
  extensions: ["css"],
}, function () {
  var minifier = new CssToolsMinifier();
  return minifier;
});

function CssToolsMinifier () {};

CssToolsMinifier.prototype.processFilesForTarget = function (files) {
  CssTools.blessCss();
  files.forEach(function (file) {
    file.addStylesheet({
      data: CssTools.minifyCss(file.getContentsAsString())
    });
  });
};


