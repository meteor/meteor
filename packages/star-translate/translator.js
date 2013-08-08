var fs = Npm.require('fs');
var path = Npm.require('path');
var ncp = Npm.require('ncp').ncp;

StarTranslator = {};

// Produces a star version of bundlePath in translatedPath, where bundlePath can
// point to either an old Meteor bundle or a star. Returns the star's manifest.
// bundlePath can equal translatedPath, in which case bundlePath is converted
// directly into a star.
StarTranslator.maybeTranslate = function (bundlePath, translatedPath) {
  var self = this;
  if (path.resolve(bundlePath) !== path.resolve(translatedPath)) {
    var _ncp = Meteor._wrapAsync(ncp);
    _ncp(bundlePath, translatedPath);
  }

  try {
    // If the directory contains a star.json file with JSON inside it, then we
    // consider it a star. Otherwise we translate it into a star.
    var manifest = JSON.parse(fs.readFileSync(path.join(translatedPath,
                                                        "star.json"),
                                              'utf8'));
    return manifest;
  } catch (e) {
    return self._translate(translatedPath);
  }
};

StarTranslator._translate = function (bundlePath) {
  var self = this;
  var clientProgPath = path.join(bundlePath, 'client.json');
  var serverProgPath = path.join(bundlePath, 'server.sh');
  var starPath = path.join(bundlePath, 'star.json');

  // Format defined in meteor/tools/bundler.js
  var manifest = {
    "format": "site-archive-pre1",
    "builtBy": "Star translator",
    "programs": [
      {
        "name": "client",
        "arch": "browser",
        "path": "client.json"
      },
      {
        "name": "server",
        "arch": self._getArch(),
        "path": "server.sh"
      }
    ]
  };

  self._writeServerProg(bundlePath, serverProgPath);
  self._writeClientProg(bundlePath, clientProgPath);

  fs.writeFileSync(starPath, JSON.stringify(manifest, null, 2));
  return manifest;
};

StarTranslator._writeServerProg = function (bundlePath, serverProgPath) {
  var platform = this._getPlatform();
  var bundleVersion = this._getBundleVersion(bundlePath);
  var runFile = 'main.js';
  var serverScript = DevBundleFetcher.script();
  // Duplicated from meteor/tools/bundler.js
  serverScript = serverScript.replace(/##PLATFORM##/g, platform);
  serverScript = serverScript.replace(/##BUNDLE_VERSION##/g, bundleVersion);
  serverScript = serverScript.replace(/##RUN_FILE##/g, runFile);
  serverScript = serverScript.replace(/##IMAGE##/g, '');
  fs.writeFileSync(serverProgPath, serverScript);
  fs.chmodSync(serverProgPath, '744');
};

StarTranslator._getArch = function () {
  return Meteor.settings.arch;
};

StarTranslator._getPlatform = function () {
  var self = this;
  // Duplicated from meteor/tools/bundler.js
  var archToPlatform = {
    'os.linux.x86_32': 'Linux_i686',
    'os.linux.x86_64': 'Linux_x86_64',
    'os.osx.x86_64': 'Darwin_x86_64'
  };
  return archToPlatform[self._getArch()];
};

StarTranslator._getBundleVersion = function (bundlePath) {
  var version = fs.readFileSync(path.join(bundlePath,
                                          "server", ".bundle_version.txt"),
                                'utf8');
  return version.trim();
};

StarTranslator._writeClientProg = function (bundlePath, clientProgPath) {
  var origClientManifest = JSON.parse(fs.readFileSync(path.join(bundlePath,
                                                                "app.json"),
                                                      'utf8'));
  var clientManifest = {
    "format": "browser-program-pre1",
    "manifest": origClientManifest.manifest,
    "page": "app.html",
    "static": "static",
    "staticCacheable": "static_cacheable"
  };
  fs.writeFileSync(clientProgPath, JSON.stringify(clientManifest, null, 2));
};
