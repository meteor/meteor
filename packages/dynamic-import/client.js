var Module = module.constructor;
var delayPromise = Promise.resolve();
var requireMeta = meteorInstall._requireMeta;
var cache = require("./cache.js");

Module.prototype.dynamicImport = function (id) {
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

    // Require the parent module from the complete meta graph.
    var meta = requireMeta(module.id);
    var versions = Object.create(null);

    function walk(meta) {
      if (meta.dynamic && ! meta.pending) {
        meta.pending = true;
        versions[meta.module.id] = meta.version;
        meta.eachChild(walkChild);
      }
    }

    function walkChild(childModule) {
      return walk(childModule.exports);
    }

    meta.eachChild(walkChild, [id]);

    var localTree;
    var missingTree;

    return Promise.all(Object.keys(versions).map(function (id) {
      return cache.check(id, versions[id]).then(function (code) {
        addToTree(localTree = localTree || Object.create(null), id, code);
      }, function (missing) {
        addToTree(missingTree = missingTree || Object.create(null), id, 1);
      });

    })).then(function () {
      if (localTree) {
        installResults(localTree);
      }

      return missingTree && fetchMissing(missingTree);

    }).then(get);
  });
};

function fetchMissing(missingTree) {
  return new Promise(function (resolve, reject) {
    Meteor.call(
      "__dynamicImport",
      missingTree,
      function (error, resultsTree) {
        error ? reject(error) : resolve(resultsTree);
      }
    );
  }).then(installResults);
}

function installResults(resultsTree) {
  var parts = [""];
  var trees = [];
  var options = [];

  function walk(tree) {
    if (typeof tree === "string") {
      var meta = requireMeta(parts.join("/"));
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
        meta.module.id,
        (0, eval)("(" + tree + ")")
      );

      // Intentionally do not delay resolution waiting for the cache.
      cache.set(meta.module.id, meta.version, tree);

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

  module.import(id, {
    "*": function (value, name) {
      namespace[name] = value;
    }
  });

  return namespace;
}
