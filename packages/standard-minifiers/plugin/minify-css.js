Plugin.registerMinifier({
  extensions: ["css"],
}, function () {
  var minifier = new CssToolsMinifier();
  return minifier;
});

function CssToolsMinifier () {};

CssToolsMinifier.prototype.processFilesForTarget = function (files) {
  var allCss = '';
  files.forEach(function (file) {
    allCss += file.getContentsAsString();
    allCss += '\n';
  });

  var minifiedFiles = CssTools.minifyCss(allCss);

  if (files.length) {
    minifiedFiles.forEach(function (minified) {
      files[0].addStylesheet({
        data: minified
      });
    });
  }
};


