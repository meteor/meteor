"use-strict";

class meteorBabelMinifier {
  processFilesForBundle(files, options) {
    // don't minify anything for development
    if (mode === 'development') {
      files.forEach(function (file) {
        file.addJavaScript({
          data: file.getContentsAsBuffer(),
          sourceMap: file.getSourceMap(),
          path: file.getPathInBundle()
        });
      });
      return;
    }

    var allJs = '';
    files.forEach(function (file) {
        // Don't reminify *.min.js.
        if (/\.min\.js$/.test(file.getPathInBundle())) {
          allJs += file.getContentsAsString();
        } else {
          allJs += meteorBabelMinify(file.getContentsAsString(), babiliOptions).code;
        }
        allJs += '\n\n';

        Plugin.nudge();
      });

    if (files.length) {
      files[0].addJavaScript({ data: allJs });
    }
  }
}

Plugin.registerMinifier({
  extensions: ['js'],
  archMatching: 'web'
}, () => new meteorBabelMinifier());