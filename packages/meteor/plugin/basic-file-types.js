/* "js" handler is now hardcoded in packages.js.. necessarily, because
   we can't exactly define the *.js source file handler in a *.js
   source file. */

Plugin.registerSourceHandler("css", function (compileStep) {
  // XXX annoying that this is replicated in .css, .less, and .styl
  if (! compileStep.archMatches('browser')) {
    // XXX in the future, might be better to emit some kind of a
    // warning if a stylesheet is included on the server, rather than
    // silently ignoring it. but that would mean you can't stick .css
    // at the top level of your app, which is kind of silly.
    return;
  }

  compileStep.addStylesheet({
    data: compileStep.read().toString('utf8'),
    path: compileStep.inputPath
  });
});
