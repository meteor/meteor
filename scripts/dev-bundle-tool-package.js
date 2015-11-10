// This file contains a package.json for the dependencies of the command-line
// tool.

// We put this in a JS file so that it can contain comments. It is processed
// into a package.json file by generate-dev-bundle.sh.

var fibersVersion;
if (process.platform === "win32") {
  // We have a fork of fibers off of version 1.0.5 that searches farther for
  // the isolate thread. This problem is a result of antivirus programs messing
  // with the thread counts on Windows.
  // Duplicated in dev-bundle-server-package.js
  fibersVersion = "https://github.com/meteor/node-fibers/tarball/d519f0c5971c33d99c902dad346b817e84bab001";
} else {
  fibersVersion = "1.0.5";
}

var packageJson = {
  name: "meteor-dev-bundle-tool",
  // Version is not important but is needed to prevent warnings.
  version: "0.0.0",
  dependencies: {
    // Explicit dependency because we are replacing it with a bundled version
    // and we want to make sure there are no dependencies on a higher version
    npm: "1.4.28",
    fibers: fibersVersion,
    "meteor-babel": "0.5.8",
    "meteor-promise": "0.5.0",
    // For various ES2015 polyfills, such as Map and Set.
    "meteor-ecmascript-runtime": "0.2.6",
    // Not yet upgrading Underscore from 1.5.2 to 1.7.0 (which should be done
    // in the package too) because we should consider using lodash instead
    // (and there are backwards-incompatible changes either way).
    underscore: "1.5.2",
    "source-map-support": "https://github.com/meteor/node-source-map-support/tarball/1912478769d76e5df4c365e147f25896aee6375e",
    semver: "4.1.0",
    request: "2.47.0",
    fstream: "https://github.com/meteor/fstream/tarball/d11b9ec4a13918447c8af7559c243c190744dd1c",
    tar: "1.0.2",
    kexec: "0.2.0",
    "source-map": "0.1.43",
    "browserstack-webdriver": "2.41.1",
    "node-inspector": "0.7.4",
    chalk: "0.5.1",
    sqlite3: "3.0.2",
    netroute: "0.2.5",
    phantomjs: "1.9.12",
    "http-proxy": "1.11.1",
    "wordwrap": "0.0.2",
    "moment": "2.8.4",
    "rimraf": "2.4.3",
    // XXX: When we update this, see if it fixes this Github issue:
    // https://github.com/jgm/CommonMark/issues/276 . If it does, remove the
    // workaround from the tool.
    "commonmark": "0.15.0",
    escope: "3.2.0",
    // 2.4.0 (more or less, the package.json change isn't committed) plus our PR
    // https://github.com/williamwicks/node-eachline/pull/4
    eachline: "https://github.com/meteor/node-eachline/tarball/ff89722ff94e6b6a08652bf5f44c8fffea8a21da",
    pathwatcher: "4.1.0",
    'lru-cache': '2.6.4',
    // We use our own fork because cordova-lib does not respect a silent
    // option and by defaults outputs all command output to stdout/stderr.
    // We can't download the tarball from GitHub because the package.json is
    // in a subdirectory. See tools/cordova/README.md for instructions on how
    // to build and upload our own tarball.
    // https://github.com/meteor/cordova-lib/tree/respect-silent/cordova-lib
    "cordova-lib": "http://com.meteor.static.s3.amazonaws.com/cordova-lib-1512fc069c7ea51c7a112cf14a8d93d69726a6f7.tar.gz",
    // Also include the Cordova CLI because it is used in tests
    "cordova": "5.2.0",
    "ios-sim": "4.1.1",
  }
};

if (process.platform !== 'darwin') {
  // Remove dependencies that require darwin on non-darwin platforms.
  delete packageJson.dependencies['ios-sim'];
}

if (process.platform === 'win32') {
  // Remove dependencies that do not work on Windows
  delete packageJson.dependencies.netroute;
  delete packageJson.dependencies.kexec;
}

process.stdout.write(JSON.stringify(packageJson, null, 2) + '\n');
