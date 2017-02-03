// The metaInstall function will be used to create a module graph that
// parallels the installed module graph. This parallel graph consists of
// metadata about all available modules, not only those already installed
// but also modules that can be fetched dynamically.
var metaInstall = makeInstaller({
  browser: makeInstallerOptions.browser
});

meteorInstall = function (tree, options) {
  if (isObject(tree)) {
    var meta = Object.create(null);
    var modules = Object.create(null);
    walk(options, tree, meta, modules);
    metaInstall(meta, options);
    return install(modules, options);
  }

  return install();
};

// Other packages (namely the dynamic-import package) call this function
// to retrieve module metadata from the metaInstall graph.
meteorInstall._requireMeta = metaInstall();

function isObject(value) {
  return value && typeof value === "object";
}

function getOrSet(obj, name) {
  return obj[name] = obj[name] || Object.create(null);
}

function walk(options, input, meta, modules) {
  Object.keys(input).forEach(function (name) {
    var value = input[name];

    if (tryChild(value, name, meta, modules, options)) {
      // If the value was a leaf node that we were able to handle, then we
      // don't need to (and can't) keep walking it.
      return;
    }

    if (isObject(value)) {
      walk(
        options,
        value,
        getOrSet(meta, name),
        getOrSet(modules, name)
      );
    }
  });

  return this;
}

function tryChild(value, name, meta, modules, options) {
  function tryFunc(value) {
    if (typeof value === "function") {
      meta[name] = makeMetaFunc({}, false, options);
      modules[name] = value;
      return true;
    }
  }

  if (Array.isArray(value)) {
    return value.some(function (value) {
      // Dynamic stub modules are represented by objects wrapped in array
      // brackets. When we find one of these objects, we install it in the
      // meta graph, but not in the installed modules graph. Later, this
      // information may be used to fetch dynamic modules from the server,
      // which will then be installed into the modules graph.
      if (isObject(value)) {
        meta[name] = makeMetaFunc(value, true, options);
        return true;
      }

      // Older versions of the install.js library supported wrapping a
      // module function in an array that also contained the dependency
      // identifier strings of that module. That style should no longer be
      // used, but we might as well handle it gracefully, since it is not
      // ambiguous with the [{...}] style.
      return tryFunc(value);
    });
  }

  // Installed (immediately importable) modules are represented by
  // function expressions with the parameters (require, exports, module).
  if (tryFunc(value)) {
    return true;
  }

  // The install.js library supports a notion of aliases, represented by
  // module identifier strings. This functionality works the same way in
  // both the meta graph and the modules graph.
  if (typeof value === "string") {
    meta[name] = value;
    modules[name] = value;
    return true;
  }
}

function makeMetaFunc(value, dynamic, options) {
  return function (require, exports, module) {
    Object.assign(exports, value);

    exports.module = module;
    exports.dynamic = !! dynamic;
    exports.options = options;

    // One of the purposes of the meta graph is to support traversing
    // module dependencies without evaluating any actual module code.
    // The eachChild function is essential to that traversal.
    exports.eachChild = function (callback, idsToRequire) {
      // By default, this function requires all value.deps dependencies
      // before iterating over the resulting children, but the caller can
      // provide a custom array of modules to require instead.
      idsToRequire = idsToRequire || (value && value.deps);

      if (Array.isArray(idsToRequire)) {
        idsToRequire.forEach(require);
      }

      // After requiring any/all dependencies of this module, iterate over
      // the children according to module.childrenById. Note that this
      // includes all children ever imported by this module, including
      // implicit modules such as package.json files.
      Object.keys(module.childrenById).forEach(function (id) {
        callback(module.childrenById[id]);
      });
    };
  };
}
