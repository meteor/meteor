var options = {};
var hasOwn = options.hasOwnProperty;

// RegExp matching strings that don't start with a `.` or a `/`.
var topLevelIdPattern = /^[^./]/;

// This function will be called whenever a module identifier that hasn't
// been installed is required. For backwards compatibility, and so that we
// can require binary dependencies on the server, we implement the
// fallback in terms of Npm.require.
options.fallback = function (id, dir, error) {
  // For simplicity, we honor only top-level module identifiers here.
  // We could try to honor relative and absolute module identifiers by
  // somehow combining `id` with `dir`, but we'd have to be really careful
  // that the resulting modules were located in a known directory (not
  // some arbitrary location on the file system), and we only really need
  // the fallback for dependencies installed in node_modules directories.
  if (topLevelIdPattern.test(id)) {
    var parts = id.split("/");
    if (parts.length === 2 &&
        parts[0] === "meteor" &&
        hasOwn.call(Package, parts[1])) {
      return Package[parts[1]];
    }

    if (typeof Npm === "object" &&
        typeof Npm.require === "function") {
      return Npm.require(id);
    }
  }

  throw error;
};

meteorInstall = makeInstaller(options);
