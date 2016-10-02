module.exports = function(context) {
  var fs = context.requireCordovaModule('fs');
  var path = context.requireCordovaModule('path');
  var xcode = context.requireCordovaModule('xcode');
  var cordova_util = context.requireCordovaModule('cordova-lib/src/cordova/util.js');
  var ConfigParser = context.requireCordovaModule('cordova-common').ConfigParser;

  var projectRoot = context.opts.projectRoot;

  var configXml = cordova_util.projectConfig(projectRoot);
  var config = new ConfigParser(configXml);
  var projectName = config.name();

  var platformRoot = path.join(context.opts.projectRoot, 'platforms/ios');
  var projectPath = path.join(platformRoot, projectName + '.xcodeproj/project.pbxproj');
  var xcodeProject = xcode.project(projectPath);

  xcodeProject.parseSync();

  var configurations, buildSettings;
  configurations = nonComments(xcodeProject.pbxXCBuildConfigurationSection());
	Object.keys(configurations).forEach(function (config) {
		buildSettings = configurations[config].buildSettings;
		buildSettings.SWIFT_VERSION = '3.0';
	});

  fs.writeFileSync(projectPath, xcodeProject.writeSync());
}

// Extracted from https://github.com/alunny/node-xcode/blob/master/lib/pbxProject.js

COMMENT_KEY = /_comment$/;

function nonComments(obj) {
  var keys = Object.keys(obj), newObj = {}, i = 0;

  for (i; i < keys.length; i++) {
    if (!COMMENT_KEY.test(keys[i])) {
      newObj[keys[i]] = obj[keys[i]];
    }
  }

  return newObj;
}
