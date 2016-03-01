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

  xcodeProject.parse(function(error) {
    if (error) {
      console.log('Error: ' + JSON.stringify(error));
    } else {
      var pbxProjectSection = xcodeProject.pbxProjectSection();
      var firstProjectUUID = Object.keys(pbxProjectSection)[0];
      var firstProject = pbxProjectSection[firstProjectUUID];
      // Xcode 7.2
      firstProject.attributes['LastSwiftUpdateCheck'] = '0720';
      fs.writeFileSync(projectPath, xcodeProject.writeSync());
    }
  });
}
