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
    fibers: "5.0.0",
    "meteor-promise": "0.8.7",
    promise: "8.1.0",
    reify: "0.20.12",
    "@babel/parser": "7.11.5",
    "@types/underscore": "1.10.24",
    underscore: "1.11.0",
    "source-map-support": "https://github.com/meteor/node-source-map-support/tarball/1912478769d76e5df4c365e147f25896aee6375e",
    "@types/semver": "5.5.0",
    semver: "5.7.0"
  },
  // These are only used in dev mode (by shell.js) so end-users can avoid
  // needing to install them if they use `npm install --production`.
  devDependencies: {
    split2: "2.2.0",
    multipipe: "2.0.1",
    chalk: "4.1.0"
  }
};

process.stdout.write(JSON.stringify(packageJson, null, 2) + '\n');
