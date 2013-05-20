var fs = Npm.require('fs');
var path = Npm.require('path');

// UGLY: reads the shell script, sticks it in an object,
// stringifies the object, and writes it out in a Javascript variable.
// This will no longer be necessary when you can include server static resources
// in the bundle.
var handler = function (compileStep) {
  var script = compileStep.read().toString('utf8').trim();
  var source = fs.readFileSync(script);
  var source_obj = { 'source': source };
  var filename = path.basename(compileStep.inputPath);
  var target = compileStep.inputPath + '.js';
  var code = 'if (! shellScripts) shellScripts = {};';
  code = code + '\nshellScripts["' + filename + '"] =' +
    JSON.stringify(source_obj) + ';';
  compileStep.addJavaScript({
    path: target,
    data: code,
    sourcePath: compileStep.inputPath,
    lineForLine: false
  });
};

Plugin.registerSourceHandler('shin', handler);
