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
