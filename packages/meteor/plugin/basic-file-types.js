/* "js" handler is now hardcoded in packages.js.. necessarily, because
   we can't exactly define the *.js source file handler in a *.js
   source file. */

Plugin.registerSourceHandler("css", {archMatching: 'web'}, function (compileStep) {
  compileStep.addStylesheet({
    data: compileStep.read().toString('utf8'),
    path: compileStep.inputPath
  });
});
