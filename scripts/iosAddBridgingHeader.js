module.exports = function(context) {
  var fs = context.requireCordovaModule('fs');
  var path = context.requireCordovaModule('path');
  var cordova_util = context.requireCordovaModule('cordova-lib/src/cordova/util.js');
  var ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;

  var projectRoot = context.opts.projectRoot;

  var configXml = cordova_util.projectConfig(projectRoot);
  var config = new ConfigParser(configXml);
  var projectName = config.name();

  var platformRoot = path.join(context.opts.projectRoot, 'platforms/ios');
  var projectBridgingHeaderPath = path.join(platformRoot, projectName,
      'Bridging-Header.h');

  var pluginId = context.opts.plugin.id;
  var pluginBridgingHeaderFilename = pluginId + '-Bridging-Header.h';
  var importDirective = '#import "' + pluginBridgingHeaderFilename + '"';

  var data = fs.readFileSync(projectBridgingHeaderPath, {'encoding': 'utf8'});

  var regExp = new RegExp("^" + importDirective + "$", "m");

  if (!regExp.test(data)) {
    fs.appendFileSync(projectBridgingHeaderPath, importDirective + "\n");
  }
}
