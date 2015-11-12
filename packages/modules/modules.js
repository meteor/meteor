var options = {};

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
  if (topLevelIdPattern.test(id) &&
      typeof Npm === "object" &&
      typeof Npm.require === "function") {
    return Npm.require(id);
  }
  throw error;
};

meteorInstall = makeInstaller(options);

meteorInstall({
  node_modules: {
    modules: {
      "css.js": function (r, exports) {
        var doc = document;
        var head = doc.getElementsByTagName("head").item(0);

        exports.addStyles = function (css) {
          var style = doc.createElement("style");

          style.setAttribute("type", "text/css");

          // https://msdn.microsoft.com/en-us/library/ms535871(v=vs.85).aspx
          var internetExplorerSheetObject =
            style.sheet || // Edge/IE11.
            style.styleSheet; // Older IEs.

          if (internetExplorerSheetObject) {
            internetExplorerSheetObject.cssText = css;
          } else {
            style.appendChild(doc.createTextNode(css));
          }

          return head.appendChild(style);
        };
      }
    }
  }
});
