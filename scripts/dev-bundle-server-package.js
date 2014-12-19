// This file contains a package.json for the dependencies of the *BUNDLED
// SERVER* (not the command-line tool).

// We put this in a JS file so that it can contain comments. It is processed
// into a package.json file by generate-dev-bundle.sh.

var packageJson = {
  name: "meteor-dev-bundle",
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
    semver: "4.1.0"
  },
  // These are only used in dev mode (by shell.js) so end-users can avoid
  // needing to install them if they use `npm install --production`.
  devDependencies: {
    // 2.4.0 (more or less, the package.json change isn't committed) plus our PR
    // https://github.com/williamwicks/node-eachline/pull/4
    eachline: "https://github.com/meteor/node-eachline/tarball/ff89722ff94e6b6a08652bf5f44c8fffea8a21da",
    chalk: "0.5.1"
  }
};


process.stdout.write(JSON.stringify(packageJson, null, 2) + '\n');
