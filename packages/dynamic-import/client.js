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

    }).then(function (resultsTree) {
      function walk(tree) {
        if (typeof tree === "string") {
          return (0, eval)("(" + tree + ")");
        }

        Object.keys(tree).forEach(function (name) {
          tree[name] = walk(tree[name]);
        });

        return tree;
      }

      meteorInstall(walk(resultsTree)); // TODO Options!
    }).then(get);
  });
};

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
