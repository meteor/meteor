var Module = module.constructor;
var delayPromise = Promise.resolve();
var requireMeta = meteorInstall._requireMeta;
var cache = require("./cache.js");
var Mp = Module.prototype;

// Call module.dynamicImport(id) to fetch a module and any/all of its
// dependencies that have not already been fetched, and evaluate them as
// soon as they arrive. This runtime API makes it very easy to implement
// ECMAScript dynamic import(...) syntax.
Mp.dynamicImport = function (id) {
  // The real (not meta) parent module.
  var module = this;

  function get() {
    return getNamespace(module, id);
  }

  return delayPromise.then(get).catch(function (error) {
    var message = error.message;
    if (! (message &&
           message.startsWith("Cannot find module"))) {
      throw error;
    }

    return module.prefetch(id).then(get);
  });
};

// Call module.prefetch(id) to fetch modules without evaluating them.
// Returns a Promise that resolves to an Error object if importing the
// given id failed, and null otherwise.
Mp.prefetch = function (id) {
  var module = this;

  // Require the parent module from the complete meta graph.
  var meta = requireMeta(module.id);
  var versions = Object.create(null);
  var dynamicVersions = require("./dynamic-versions.js");

  function walk(meta) {
    if (meta.dynamic && ! meta.pending) {
      meta.pending = true;
      var id = meta.module.id;
      versions[id] = getFromTree(dynamicVersions, id);
      meta.eachChild(walkChild);
    }
  }

  function walkChild(childModule) {
    return walk(childModule.exports);
  }

  meta.eachChild(walkChild, [id]);

  var error = meta.errors && meta.errors[id];
  if (error) {
    // If module.prefetch(id) fails, the failure will probably be reported
    // as an uncaught promise rejection, unless the calling code
    // deliberately handles the rejection. This seems appropriate because
    // failed prefetches should not be fatal to the application, yet they
    // should be noticeable, so that they can be cleaned up at some point.
    return Promise.reject(error);
  }

  return cache.checkMany(versions).then(function (sources) {
    var localTree = null;
    var missingTree = null;

    Object.keys(sources).forEach(function (id) {
      var source = sources[id];
      if (source) {
        addToTree(localTree = localTree || Object.create(null), id, source);
      } else {
        addToTree(missingTree = missingTree || Object.create(null), id, 1);
      }
    });

    if (localTree) {
      installResults(localTree, true);
    }

    return missingTree && fetchMissing(missingTree);

  }).then(function () {
    // If everything was successful, the final result of the
    // module.prefetch(id) promise will be the fully-resolved absolute
    // form of the given identifier.
    return module.resolve(id);
  });
};

// Results from fetchMissing must be delivered in the same order as calls
// to fetchMissing, because previous results may include modules needed by
// more recent calls. In practice, results are usually delivered in order,
// but might be delivered out of order because the __dynamicImport method
// calls this.unblock(). To achieve this ordering of results while still
// allowing parallel __dynamicImport method calls, we keep track of the
// most recent Promise returned by fetchMissing, and delay resolving the
// next Promise until the previous Promise has been resolved or rejected.
var lastFetchMissingPromise = delayPromise;

function fetchMissing(missingTree) {
  // Save the Promise that was most recent when fetchMissing was called.
  var previousPromise = lastFetchMissingPromise;

  // Update lastFetchMissingPromise immediately, without waiting for
  // the results to be delivered.
  return lastFetchMissingPromise = new Promise(function (resolve, reject) {
    Meteor.call(
      "__dynamicImport",
      missingTree,
      function (error, resultsTree) {
        if (error) {
          reject(error);
        } else {
          resolve = resolve.bind(null, resultsTree)
          // Continue even if previousPromise was rejected.
          previousPromise.then(resolve, resolve);
        }
      }
    );
  }).then(installResults);
}

function installResults(resultsTree, doNotCache) {
  var parts = [""];
  var trees = [];
  var options = [];
  var versionsAndSourcesById = Object.create(null);

  function walk(tree) {
    if (typeof tree === "string") {
      var meta = requireMeta(parts.join("/"));
      var id = meta.module.id;
      var optionsIndex = options.indexOf(meta.options);
      if (optionsIndex < 0) {
        options[optionsIndex = options.length] = meta.options;
        trees.push(Object.create(null));
      }

      // The results tree is partitioned into separate trees according
      // to the meta.options object that governs the tree. Usually the
      // number of trees will be approximately one, because options
      // are shared by entire bundles.
      addToTree(
        trees[optionsIndex],
        id,
        // By calling (meta.options.eval || eval) in a wrapper function,
        // we delay the cost of parsing and evaluating the module code
        // until the module is first imported.
        function () {
          // If an options.eval function was provided in the second
          // argument to meteorInstall when this bundle was first
          // installed, use that function to parse and evaluate the
          // dynamic module code in the scope of the package. Otherwise
          // fall back to indirect (global) eval.
          return (meta.options.eval || eval)(
            // Wrap the function(require,exports,module){...} expression
            // in parentheses to force it to be parsed as an expression.
            "(" + tree + ")"
          ).apply(this, arguments);
        }
      );

      // Intentionally do not delay resolution waiting for the cache.
      if (! doNotCache) {
        var version = getFromTree(require("./dynamic-versions.js"), id);
        if (version) {
          versionsAndSourcesById[id] = {
            version: version,
            source: tree
          };
        }
      }

    } else {
      Object.keys(tree).forEach(function (name) {
        parts.push(name);
        walk(tree[name]);
        parts.pop(name);
      });
    }
  }

  walk(resultsTree);

  trees.forEach(function (tree, i) {
    meteorInstall(tree, options[i]);
  });

  if (! doNotCache) {
    cache.setMany(versionsAndSourcesById);
  }

  return null;
}

function getFromTree(tree, id) {
  id.split("/").every(function (part) {
    return ! part || (tree = tree[part]);
  });

  return tree;
}

function addToTree(tree, id, value) {
  var parts = id.split("/");
  var lastIndex = parts.length - 1;
  parts.forEach(function (part, i) {
    if (part) {
      tree = tree[part] = tree[part] ||
        (i < lastIndex ? Object.create(null) : value);
    }
  });
}

function getNamespace(module, id) {
  var namespace = Object.create(null);

  module.importSync(id, {
    "*": function (value, name) {
      namespace[name] = value;
    }
  });

  // This helps with Babel interop, since we're not just returning the
  // module.exports object.
  Object.defineProperty(namespace, "__esModule", {
    value: true,
    enumerable: false
  });

  return namespace;
}
