// This file contains a package.json for the dependencies of the command-line
// tool.

// We put this in a JS file so that it can contain comments. It is processed
// into a package.json file by generate-dev-bundle.sh.

var packageJson = {
  name: "meteor-dev-bundle-tool",
  private: true,
  dependencies: {
    // Explicit dependency because we are replacing it with a bundled version
    // and we want to make sure there are no dependencies on a higher version
    npm: "5.6.0",
    pacote: "https://github.com/meteor/pacote/tarball/30973f140df79b647dbade03f2d6f19800c2609b",
    "node-gyp": "3.6.2",
    "node-pre-gyp": "0.6.36",
    "meteor-babel": "7.0.0-beta.38-2",
    "meteor-promise": "0.8.6",
    promise: "8.0.1",
    reify: "0.13.7",
    fibers: "2.0.0",
    // So that Babel can emit require("@babel/runtime/helpers/...") calls.
    "@babel/runtime": "7.0.0-beta.38",
    // For backwards compatibility with isopackets that still depend on
    // babel-runtime rather than @babel/runtime.
    "babel-runtime": "7.0.0-beta.3",
    // Not yet upgrading Underscore from 1.5.2 to 1.7.0 (which should be done
    // in the package too) because we should consider using lodash instead
    // (and there are backwards-incompatible changes either way).
    underscore: "1.5.2",
    "source-map-support": "https://github.com/meteor/node-source-map-support/tarball/1912478769d76e5df4c365e147f25896aee6375e",
    semver: "5.4.1",
    request: "2.83.0",
    fstream: "https://github.com/meteor/fstream/tarball/cf4ea6c175355cec7bee38311e170d08c4078a5d",
    tar: "2.2.1",
    kexec: "3.0.0",
    "source-map": "0.5.3",
    chalk: "0.5.1",
    sqlite3: "3.1.8",
    netroute: "1.0.2",
    "http-proxy": "1.16.2",
    "wordwrap": "0.0.2",
    "moment": "2.20.1",
    "rimraf": "2.6.2",
    "glob": "7.1.2",
    ignore: "3.3.7",
    // XXX: When we update this, see if it fixes this Github issue:
    // https://github.com/jgm/CommonMark/issues/276 . If it does, remove the
    // workaround from the tool.
    "commonmark": "0.15.0",
    escope: "3.6.0",
    split2: "2.2.0",
    multipipe: "2.0.1",
    pathwatcher: "7.1.1",
    optimism: "0.3.3",
    'lru-cache': '4.1.1',
    longjohn: '0.2.12'
  }
};

if (process.platform === 'win32') {
  // Remove dependencies that do not work on Windows
  delete packageJson.dependencies.netroute;
  delete packageJson.dependencies.kexec;
}

process.stdout.write(JSON.stringify(packageJson, null, 2) + '\n');
