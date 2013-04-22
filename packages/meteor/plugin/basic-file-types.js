/* "js" handler is now hardcoded in packages.js.. necessarily, because
   we can't exactly define the *.js source file handler in a *.js
   source file. */

Plugin.registerSourceHandler("css", function (compileStep) {
  // XXX use archinfo rather than rolling our own
  if (! compileStep.arch.match(/^browser(\.|$)/)) {
    // XXX in the future, might be better to emit some kind of a
    // warning if a stylesheet is included on the server, rather than
    // silently ignoring it
    return;
  }

  compileStep.addStylesheet({
    data: compileStep.read().toString('utf8'),
    path: compileStep.inputPath
  });
});
