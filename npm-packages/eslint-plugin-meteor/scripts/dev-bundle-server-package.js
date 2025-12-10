// This file contains a package.json for the dependencies of the *BUNDLED
// SERVER* (not the command-line tool).

// We put this in a JS file so that it can contain comments. It is processed
// into a package.json file by generate-dev-bundle.sh.

var packageJson = {
  name: "meteor-dev-bundle",
  private: true,
  dependencies: {
    promise: "8.1.0",
    "@meteorjs/reify": "0.25.3",
    "@babel/parser": "7.17.0",
    "@types/underscore": "1.11.4",
    underscore: "1.13.6",
    "source-map-support": "https://github.com/meteor/node-source-map-support/tarball/1912478769d76e5df4c365e147f25896aee6375e",
    "@types/semver": "5.5.0",
    semver: "5.7.1"
  },
  // These are only used in dev mode (by shell.js) so end-users can avoid
  // needing to install them if they use `npm install --production`.
  devDependencies: {
    split2: "3.2.2",
    multipipe: "2.0.1",
    chalk: "4.1.2"
  }
};

process.stdout.write(JSON.stringify(packageJson, null, 2) + '\n');
