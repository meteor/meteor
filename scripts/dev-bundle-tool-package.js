// This file contains a package.json for the dependencies of the command-line
// tool.

// We put this in a JS file so that it can contain comments. It is processed
// into a package.json file by generate-dev-bundle.sh.

var packageJson = {
  name: "meteor-dev-bundle-tool",
  // Version is not important but is needed to prevent warnings.
  version: "0.0.0",
  dependencies: {
    // Explicit dependency because we are replacing it with a bundled version
    // and we want to make sure there are no dependencies on a higher version
    npm: "4.6.1",
    "node-gyp": "3.6.0",
    "node-pre-gyp": "0.6.34",
    "meteor-babel": "0.23.1",
    "meteor-promise": "0.8.5",
    reify: "0.12.0",
    promise: "8.0.1",
    fibers: "1.0.15",
    // So that Babel 6 can emit require("babel-runtime/helpers/...") calls.
    "babel-runtime": "6.9.2",
    // For various ES2015 polyfills, such as Map and Set.
    "meteor-ecmascript-runtime": "0.3.0",
    // Not yet upgrading Underscore from 1.5.2 to 1.7.0 (which should be done
    // in the package too) because we should consider using lodash instead
    // (and there are backwards-incompatible changes either way).
    underscore: "1.5.2",
    "source-map-support": "https://github.com/meteor/node-source-map-support/tarball/1912478769d76e5df4c365e147f25896aee6375e",
    semver: "5.3.0",
    request: "2.47.0",
    fstream: "https://github.com/meteor/fstream/tarball/cf4ea6c175355cec7bee38311e170d08c4078a5d",
    tar: "2.2.1",
    kexec: "2.0.2",
    "source-map": "0.5.3",
    "node-inspector": "1.1.1",
    "v8-profiler": "5.7.0",
    chalk: "0.5.1",
    sqlite3: "3.1.3",
    netroute: "1.0.2",
    "http-proxy": "1.11.1",
    "wordwrap": "0.0.2",
    "moment": "2.8.4",
    "rimraf": "2.6.1",
    "glob": "7.0.6",
    ignore: "3.3.5",
    // XXX: When we update this, see if it fixes this Github issue:
    // https://github.com/jgm/CommonMark/issues/276 . If it does, remove the
    // workaround from the tool.
    "commonmark": "0.15.0",
    escope: "3.2.0",
    split2: "2.1.1",
    multipipe: "1.0.2",
    pathwatcher: "6.7.1",
    optimism: "0.3.3",
    'lru-cache': '4.0.1',
    'cordova-lib': "7.0.1",
    longjohn: '0.2.12'
  }
};

if (process.platform === 'win32') {
  // Remove dependencies that do not work on Windows
  delete packageJson.dependencies.netroute;
  delete packageJson.dependencies.kexec;
}

process.stdout.write(JSON.stringify(packageJson, null, 2) + '\n');
