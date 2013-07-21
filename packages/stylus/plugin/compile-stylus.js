var fs = Npm.require('fs');
var stylus = Npm.require('stylus');
var nib = Npm.require('nib');

Plugin.registerSourceHandler("styl", function (compileStep) {
  stylus(compileStep.read().toString('utf8'))
    .use(nib())
    .set('filename', compileStep.inputPath)
    .render(function(err, output) {
      if (err) {
        // XXX better error handling, once the Plugin interface support it
        throw new Error('Stylus compiler error: ' + err.message);
      }

      compileStep.addStylesheet({
        path: compileStep.inputPath + ".css",
        data: output
      });
    });
  }
);
