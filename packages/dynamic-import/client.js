var Module = module.constructor;
var delayPromise = Promise.resolve();
var requireMeta = meteorInstall._requireMeta;

Module.prototype.dynamicImport = function (id) {
  // The real (not meta) parent module.
  var module = this;

  function get() {
    return getNamespace(module, id);
  }

  return delayPromise.then(get).catch(function (error) {
    // Require the current module from the complete meta graph.
    var meta = requireMeta(module.id);
    var missingTree = Object.create(null);

    function walk(meta) {
      if (meta.dynamic && ! meta.pending) {
        meta.pending = true;
        addToTree(missingTree, meta.module.id, 1);
        meta.eachChild(walkChild);
      }
    }

    function walkChild(childModule) {
      walk(childModule.exports);
    }

    // The meta.eachChild iteration includes all child modules imported by
    // meta.module, not just the child explicitly required here, so that
    // implicit modules like package.json will be included too. See
    // meteor/packages/modules-runtime/meteor-install.js for the
    // definition of meta.eachChild.
    meta.eachChild(walkChild, [id]);

    return new Promise(function (resolve, reject) {
      Meteor.call(
        "__dynamicImport",
        missingTree,
        function (error, resultsTree) {
          error ? reject(error) : resolve(resultsTree);
        }
      );

    }).then(installResults).then(get);
  });
};

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
