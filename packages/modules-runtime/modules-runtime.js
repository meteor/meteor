var options = {
  // File extensions to try when an imported module identifier does not
  // exactly match any installed file.
  extensions: []
};

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

if (Meteor.isServer) {
  // Defining Module.prototype.useNode allows the module system to
  // delegate evaluation to Node, unless useNode returns false.
  (options.Module = function Module(id) {
    // Same as the default Module constructor implementation.
    this.id = id;
  }).prototype.useNode = function () {
    if (typeof npmRequire !== "function") {
      // Can't use Node if npmRequire is not defined.
      return false;
    }

    var parts = this.id.split("/");
    var start = 0;
    if (parts[start] === "") ++start;
    if (parts[start] === "node_modules" &&
        parts[start + 1] === "meteor") {
      start += 2;
    }

    if (parts.indexOf("node_modules", start) < 0) {
      // Don't try to use Node for modules that aren't in node_modules
      // directories.
      return false;
    }

    try {
      npmRequire.resolve(this.id);
    } catch (e) {
      return false;
    }

    this.exports = npmRequire(this.id);

    return true;
  };
}

var install = makeInstaller(options);

(install.addExtension = function (ext) {
  var args = arguments;
  for (var i = 0; i < args.length; ++i) {
    ext = args[i].toLowerCase();

    if (! /^\.\w+/.test(ext)) {
      throw new Error("bad module extension: " + ext);
    }

    var extensions = options.extensions;
    if (extensions.indexOf(ext) < 0) {
      extensions.push(ext);
    }
  }
})(".js", ".json");

meteorInstall = install;
