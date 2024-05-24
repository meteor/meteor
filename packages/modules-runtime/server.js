// Options that will be populated below and then passed to makeInstaller.
var makeInstallerOptions = {};

// RegExp matching strings that don't start with a `.` or a `/`.
var topLevelIdPattern = /^[^./]/;

// This function will be called whenever a module identifier that hasn't
// been installed is required. For backwards compatibility, and so that we
// can require binary dependencies on the server, we implement the
// fallback in terms of Npm.require.
makeInstallerOptions.fallback = function (id, parentId, error) {
  // For simplicity, we honor only top-level module identifiers here.
  // We could try to honor relative and absolute module identifiers by
  // somehow combining `id` with `dir`, but we'd have to be really careful
  // that the resulting modules were located in a known directory (not
  // some arbitrary location on the file system), and we only really need
  // the fallback for dependencies installed in node_modules directories.
  if (topLevelIdPattern.test(id)) {
    if (id && id.startsWith('meteor/')) {
      const [meteorPrefix, packageName] = id.split('/', 2);
      throw new Error(
        `Cannot find package "${packageName}". ` +
        `Try "meteor add ${packageName}".`
      );
    }
    if (typeof Npm === "object" &&
        typeof Npm.require === "function") {
      return Npm.require(id, error);
    }
  }
  verifyErrors(id, parentId, error);
  throw error;
};

makeInstallerOptions.fallback.resolve = function (id, parentId, error) {
  if (topLevelIdPattern.test(id)) {
    // Allow any top-level identifier to resolve to itself on the server,
    // so that makeInstallerOptions.fallback has a chance to handle it.
    return id;
  }

  throw error;
};

meteorInstall = makeInstaller(makeInstallerOptions);
var Module = meteorInstall.Module;

Module.prototype.useNode = function () {
  if (typeof npmRequire !== "function") {
    // Can't use Node if npmRequire is not defined.
    throw new Error('npmRequire must be defined to use useNode');
  }

  try {
    npmRequire.resolve(this.id);
  } catch (e) {
    throw new Error(
      `Cannot find module "${this.id}". ` +
      `Try installing the npm package or make sure it is not a devDependency.`
    );
  }

  // See tools/static-assets/server/npm-require.js for the implementation
  // of npmRequire. Note that this strategy fails when importing ESM
  // modules (typically, a .js file in a package with "type": "module" in
  // its package.json), as of Node 12.16.0 (Meteor 1.9.1).
  this.exports = npmRequire(this.id);
};
