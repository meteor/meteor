module.exports = function(context, CordovaIos) {
  var fs = require('fs');
  var path = require('path');
  var createRequire = require('module').createRequire;
  var projectRequire = createRequire(path.join(
    context.opts.projectRoot,
    'package.json'
  ));
  CordovaIos = CordovaIos || projectRequire('cordova-ios');

  var platformRoot = path.join(context.opts.projectRoot, 'platforms/ios');
  var iosProject = new CordovaIos('ios', platformRoot);
  var projectBridgingHeaderPath = path.join(iosProject.locations.xcodeCordovaProj,
      'Bridging-Header.h');

  var pluginId = context.opts.plugin.id;
  var pluginBridgingHeaderFilename = pluginId + '-Bridging-Header.h';
  var importDirective = '#import "' + pluginBridgingHeaderFilename + '"';

  var data = fs.readFileSync(projectBridgingHeaderPath, {'encoding': 'utf8'});

  var regExp = new RegExp("^" + importDirective + "$", "m");

  if (!regExp.test(data)) {
    fs.appendFileSync(projectBridgingHeaderPath, importDirective + "\n");
  }
};
