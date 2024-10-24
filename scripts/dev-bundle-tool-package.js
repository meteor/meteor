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
    npm: "10.9.0",
    "node-gyp": "10.2.0",
    "@mapbox/node-pre-gyp": "1.0.11",
    typescript: "5.6.3",
    "@meteorjs/babel": "7.20.0",
    // Keep the versions of these packages consistent with the versions
    // found in dev-bundle-server-package.js.
    "@meteorjs/reify": "0.25.4",
    // So that Babel can emit require("@babel/runtime/helpers/...") calls.
    "@babel/runtime": "7.25.0",
    // For backwards compatibility with isopackets that still depend on
    // babel-runtime rather than @babel/runtime.
    "babel-runtime": "7.0.0-beta.3",
    "@types/underscore": "1.11.15",
    underscore: "1.13.7",
    "source-map-support": "https://github.com/meteor/node-source-map-support/tarball/1912478769d76e5df4c365e147f25896aee6375e",
    "@types/semver": "7.5.8",
    semver: "7.6.3",
    request: "2.88.2",
    uuid: "3.4.0",
    "graceful-fs": "4.2.11",
    fstream: "https://github.com/meteor/fstream/tarball/cf4ea6c175355cec7bee38311e170d08c4078a5d",
    tar: "6.1.11",
    'tar-fs': "2.1.1",
    // Fork of kexec@3.0.0 with my Node.js 12 compatibility PR
    // https://github.com/jprichardson/node-kexec/pull/37 applied.
    // TODO: We should replace this with: https://github.com/jprichardson/node-kexec/pull/38
    kexec: "https://github.com/meteor/node-kexec/tarball/f29f54037c7db6ad29e1781463b182e5929215a0",
    "source-map": "0.7.4",
    chalk: "4.1.2",
    // TODO: maybe replace with https://www.npmjs.com/package/better-sqlite3
    sqlite3: "5.1.7",
    inquirer: "8.2.6",
    "http-proxy": "1.18.1",
    "is-reachable": "3.1.0",
    "wordwrap": "1.0.0",
    "moment": "2.30.1",
    "rimraf": "2.6.2",
    "glob": "7.1.6",
    ignore: "5.3.2",
    // XXX: When we update this, see if it fixes this Github issue:
    // https://github.com/jgm/CommonMark/issues/276 . If it does, remove the
    // workaround from the tool.
    "commonmark": "0.15.0",
    escope: "3.6.0",
    split2: "3.2.2",
    multipipe: "2.0.1",
    pathwatcher: "8.1.2",
    "vscode-nsfw": "2.1.8",
    // The @wry/context package version must be compatible with the
    // version constraint imposed by optimism/package.json.
    optimism: "0.16.1",
    "@wry/context": "0.6.0",
    'lru-cache': '6.0.0',
    "anser": "2.1.1",
    'xmlbuilder2': '1.8.1',
    "ws": "7.4.5",
    "open":"8.4.2"
  }
};

if (process.platform === 'win32') {
  // Remove dependencies that do not work on Windows
  delete packageJson.dependencies.netroute;
  delete packageJson.dependencies.kexec;
}

process.stdout.write(JSON.stringify(packageJson, null, 2) + '\n');
