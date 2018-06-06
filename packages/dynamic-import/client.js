var Module = module.constructor;
var cache = require("./cache.js");
var HTTP = require("meteor/http").HTTP;
var meteorInstall = require("meteor/modules").meteorInstall;

// Call module.dynamicImport(id) to fetch a module and any/all of its
// dependencies that have not already been fetched, and evaluate them as
// soon as they arrive. This runtime API makes it very easy to implement
// ECMAScript dynamic import(...) syntax.
Module.prototype.dynamicImport = function (id) {
  var module = this;
  return module.prefetch(id).then(function () {
    return getNamespace(module, id);
  });
};

// Called by Module.prototype.prefetch if there are any missing dynamic
// modules that need to be fetched.
meteorInstall.fetch = function (ids) {
  var tree = Object.create(null);
  var versions = Object.create(null);
  var dynamicVersions = require("./dynamic-versions.js");
  var missing;

  function addSource(id, source) {
    addToTree(tree, id, makeModuleFunction(id, source, ids[id].options));
  }

  function addMissing(id) {
    addToTree(missing = missing || Object.create(null), id, 1);
  }

  Object.keys(ids).forEach(function (id) {
    var version = dynamicVersions.get(id);
    if (version) {
      versions[id] = version;
    } else {
      addMissing(id);
    }
  });

  return cache.checkMany(versions).then(function (sources) {
    Object.keys(sources).forEach(function (id) {
      var source = sources[id];
      if (source) {
        addSource(id, source);
      } else {
        addMissing(id);
      }
    });

    return missing && fetchMissing(missing).then(function (results) {
      var versionsAndSourcesById = Object.create(null);
      var flatResults = flattenModuleTree(results);

      Object.keys(flatResults).forEach(function (id) {
        var source = flatResults[id];
        addSource(id, source);

        var version = dynamicVersions.get(id);
        if (version) {
          versionsAndSourcesById[id] = {
            version: version,
            source: source
          };
        }
      });

      cache.setMany(versionsAndSourcesById);
    });

  }).then(function () {
    return tree;
  });
};

function flattenModuleTree(tree) {
  var parts = [""];
  var result = Object.create(null);

  function walk(t) {
    if (t && typeof t === "object") {
      Object.keys(t).forEach(function (key) {
        parts.push(key);
        walk(t[key]);
        parts.pop();
      });
    } else if (typeof t === "string") {
      result[parts.join("/")] = t;
    }
  }

  walk(tree);

  return result;
}

function makeModuleFunction(id, source, options) {
  // By calling (options && options.eval || eval) in a wrapper function,
  // we delay the cost of parsing and evaluating the module code until the
  // module is first imported.
  return function () {
    // If an options.eval function was provided in the second argument to
    // meteorInstall when this bundle was first installed, use that
    // function to parse and evaluate the dynamic module code in the scope
    // of the package. Otherwise fall back to indirect (global) eval.
    return (options && options.eval || eval)(
      // Wrap the function(require,exports,module){...} expression in
      // parentheses to force it to be parsed as an expression.
      "(" + source + ")\n//# sourceURL=" + id
    ).apply(this, arguments);
  };
}

var secretKey = null;
exports.setSecretKey = function (key) {
  secretKey = key;
};

var fetchURL = require("./common.js").fetchURL;

function fetchMissing(missingTree) {
  return new Promise(function (resolve, reject) {
    // If the hostname of the URL returned by Meteor.absoluteUrl differs
    // from location.host, then we'll be making a cross-origin request
    // here, but that's fine because the dynamic-import server sets
    // appropriate CORS headers to enable fetching dynamic modules from
    // any origin. Browsers that check CORS do so by sending an additional
    // preflight OPTIONS request, which may add latency to the first
    // dynamic import() request, so it's a good idea for ROOT_URL to match
    // location.host if possible, though not strictly necessary.
    HTTP.call("POST", Meteor.absoluteUrl(fetchURL), {
      query: secretKey ? "key=" + secretKey : void 0,
      data: missingTree
    }, function (error, result) {
      error ? reject(error) : resolve(result.data);
    });
  });
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
  var namespace;

  module.watch(module.require(id), {
    "*": function (ns) {
      namespace = ns;
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
