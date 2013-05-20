var path = Npm.require('path');

var handler = function (compileStep) {
  var source = compileStep.read().toString('utf8');
  var source_obj = { source: source };
  var filename = path.basename(compileStep.inputPath);
  var target = compileStep.inputPath + '.js';
  var code = '//@export shellScripts\nif (! shellScripts) shellScripts = {};';
  code = code + '\nshellScripts["' + filename + '"] =' +
    JSON.stringify(source_obj) + ';';
  compileStep.addJavaScript({
    path: target,
    data: code,
    sourcePath: compileStep.inputPath,
    lineForLine: false
  });
};

Plugin.registerSourceHandler('in', handler);
