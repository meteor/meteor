// This file contains a package.json for the dependencies of the command-line
// tool.

// We put this in a JS file so that it can contain comments. It is processed
// into a package.json file by generate-dev-bundle.sh.

var packageJson = {
  name: "meteor-dev-bundle-tool",
  // Version is not important but is needed to prevent warnings.
  version: "0.0.0",
  dependencies: {
    // Fibers 1.0.2 is out but introduces a bug that's been fixed on master
    // but unreleased: https://github.com/laverdet/node-fibers/pull/189
    // We will definitely need to upgrade in order to support Node 0.12 when
    // it's out, though.
    fibers: "1.0.1",
    // Not yet upgrading Underscore from 1.5.2 to 1.7.0 (which should be done
    // in the package too) because we should consider using lodash instead
    // (and there are backwards-incompatible changes either way).
    underscore: "1.5.2",
    "source-map-support": "0.2.8",
    semver: "4.1.0",

    request: "2.47.0",
    fstream: "1.0.2",
    tar: "1.0.2",
    kexec: "0.2.0",
    "source-map": "0.1.40",
    "browserstack-webdriver": "2.41.1",
    "node-inspector": "0.7.4",
    chalk: "0.5.1",
    sqlite3: "3.0.2",
    netroute: "0.2.5",
    phantomjs: "1.9.12",
    "http-proxy": "1.6.0",
    // XXX We ought to be able to get this from the copy in js-analyze rather
    // than in the dev bundle.)
    esprima: "1.2.2",
    // 2.4.0 (more or less, the package.json change isn't committed) plus our PR
    // https://github.com/williamwicks/node-eachline/pull/4
    eachline: "https://github.com/meteor/node-eachline/tarball/ff89722ff94e6b6a08652bf5f44c8fffea8a21da",

    // XXX We install our own fork of cordova because we need a particular patch that
    // didn't land to cordova-android yet. As soon as it lands, we can switch back to
    // upstream.
    // https://github.com/apache/cordova-android/commit/445ddd89fb3269a772978a9860247065e5886249
    //    npm install cordova@3.5.0-0.2.6
    "cordova": "https://github.com/meteor/cordova-cli/tarball/0c9b3362c33502ef8f6dba514b87279b9e440543"
  }
};


process.stdout.write(JSON.stringify(packageJson, null, 2) + '\n');
