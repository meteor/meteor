// This magic double-underscored identifier gets replaced in
// tools/isobuild/bundler.js with a tree of hashes of all dynamic
// modules, for use in client.js and cache.js.
var versions = __DYNAMIC_VERSIONS__;

exports.get = function (id) {
  var tree = versions;
  var version = null;

  id.split("/").some(function (part) {
    if (part) {
      // If the tree contains identifiers for Meteor packages with colons
      // in their names, the colons should not have been replaced by
      // underscores, but there's a bug that results in that behavior, so
      // for now it seems safest to be tolerant of underscores here.
      // https://github.com/meteor/meteor/pull/9103
      tree = tree[part] || tree[part.replace(":", "_")];
    }

    if (! tree) {
      // Terminate the search without reassigning version.
      return true;
    }

    if (typeof tree === "string") {
      version = tree;
      return true;
    }
  });

  return version;
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

// If Package.appcache is loaded, preload additional modules after
// the core bundle has been loaded
if (Package.appcache) {
  // Use window.onload to only prefetch after the main bundle has loaded
  window.addEventListener('load', function (event) {
    // prefetch in chunks to reduce overhead
    // If we call module.prefetch(id) multiple times in the same tick of
    // the event loop, all those modules will be fetched in one request.
    function prefetchInChunks(modules, amount) {
      var promises = Promise.all(modules.splice(0, amount).map(function (id) {
        return module.prefetch(id)
      })).then(function () {
        if (modules.length > 0) {
          prefetchInChunks(modules, amount);
        }
      })
    }
    // get a flat array of modules start prefetching
    prefetchInChunks(Object.keys(flattenModuleTree(versions)), 20);
  })
}
