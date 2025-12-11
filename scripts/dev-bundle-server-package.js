// This file contains a package.json for the dependencies of the *BUNDLED
// SERVER* (not the command-line tool).

// We put this in a JS file so that it can contain comments. It is processed
// into a package.json file by generate-dev-bundle.sh.

var packageJson = {
  name: "meteor-dev-bundle",
  private: true,
  dependencies: {
    // Keep the versions of these packages consistent with the versions
    // found in dev-bundle-tool-package.js.
    promise: "8.3.0",
    "@meteorjs/reify": "0.25.4",
    "@babel/parser": "7.25.0",
    "lru-cache": "6.0.0",
    underscore: "1.13.7",
    "source-map-support": "https://github.com/meteor/node-source-map-support/tarball/81bce1f99625e62af73338f63afcf2b44c6cfa5e",
    "@types/semver": "7.5.8",
    semver: "7.6.3"
  },
  // These are only used in dev mode (by shell.js) so end-users can avoid
  // needing to install them if they use `npm install --production`.
  devDependencies: {
    "@types/underscore": "1.11.15",
    split2: "3.2.2",
    multipipe: "2.0.1",
    chalk: "4.1.2"
  }
};

process.stdout.write(JSON.stringify(packageJson, null, 2) + '\n');
