// TODO: add an api to Reify to update cached exports for a module
const ReifyEntry = require('/node_modules/meteor/modules/node_modules/reify/lib/runtime/entry.js')

// Due to the bundler and proxy running in the same node process
// this could possibly be ran after the next build finished
// TODO: the builder should inject the build time in the bundle
let lastUpdated = Date.now();

let arch = __meteor_runtime_config__.isModern ? 'web.browser' : 'web.browser.legacy';
let enabled = arch === 'web.browser';

if (!enabled) {
  console.log(`HMR is not supported in ${arch}`);
}

let pendingReload = null;
let mustReload = false;

// TODO: handle disconnects
const socket = new WebSocket('ws://localhost:3124');

function requestChanges() {
  socket.send(JSON.stringify({
    type: 'request-changes',
    arch,
    after: lastUpdated
  }));
}

socket.addEventListener('open', function () {
  console.log('HMR: connected');
});

socket.addEventListener('message', function (event) {
  let message = JSON.parse(event.data);

  switch (message.type) {
    case 'changes':
      // TODO: support removed or added files
      const hasUnreloadable = message.changeSets.find(changeSet => {
        return !changeSet.reloadable ||
          changeSet.removedFilePaths.length > 0 ||
          changeSet.addedFiles.length > 0
      })
      if (
        pendingReload &&
        hasUnreloadable ||
        message.changeSets.length === 0
      ) {
        console.log('HMR: Unable to do HMR. Falling back to hot code push.')
        // Complete hot code push if we can not do hot module reload
        mustReload = true;
        return pendingReload();
      }

      // In case the user changed how a module works with HMR
      // in one of the earlier change sets, we want to apply each
      // change set one at a time.
      message.changeSets.forEach(changeSet => {
        applyChangeset(changeSet);
      });

      if (message.changeSets.length > 0) {
        lastUpdated = message.changeSets[message.changeSets.length - 1].linkedAt;
      }
  }
});

function walkTree(pathParts, tree) {
  const part = pathParts.shift();
  const _module = tree.contents[part];

  if (!_module) {
    console.log(part, pathParts, _module, tree);
    throw new Error('not-exist');
  }

  if (pathParts.length === 0) {
    return _module;
  }

  return walkTree(pathParts, _module);
}

function createInlineSourceMap(map) {
  return "//# sourceMappingURL=data:application/json;base64," + btoa(JSON.stringify(map));
}

function replaceFileContent(file, contents) {
  console.log('HMR: replacing module:', file.module.id);

  // TODO: to replace content in packages, we need an eval function that runs
  // within the package scope, like dynamic imports does.
  const moduleFunction = function () {
    // TODO: Use same sourceURL as the sourcemap for the main bundle does
    return eval(
      // Wrap the function(require,exports,module){...} expression in
      // parentheses to force it to be parsed as an expression.
      "(" + contents.code + ")\n//# sourceURL=" + file.module.id +
      "\n" + createInlineSourceMap(contents.map)
    ).apply(this, arguments);
  }

  file.contents = moduleFunction;
}

function rerunFile(file) {
  delete file.module.exports;
  file.module.loaded = false;

  console.log('HMR: rerunning', file.module.id);
  // re-eveluate the file
  require(file.module.id);
}

const oldLink = module.constructor.prototype.link;
module.constructor.prototype.link = function (path) {
  if (this._recordImport) {
    this._recordImport(path);
  };
  return oldLink.apply(this, arguments);
}

function findReloadableParents(importedBy) {
  return Object.values(importedBy).map(parentFile => {
    // Force module to be rerun when we complete applying the changeset
    parentFile.module.replaceModule();

    const canAccept = parentFile.module.hot && parentFile.module.hot._canAcceptUpdate();
    if (canAccept === true) {
      return parentFile;
    } else if (
      canAccept === null && Object.keys(parentFile.importedBy).length > 0
    ) {
      // When canAccept is null, whether it is reloadable or not depends on
      // if its parents can accept changes.
      return findReloadableParents(parentFile.importedBy);
    } else {
      return false;
    }
  }).flat(Infinity);
}

module.constructor.prototype.replaceModule = function (id, contents) {
  const moduleId = id || this.id;
  const root = this._getRoot();

  let file;
  try {
    file = walkTree(moduleId.split('/').slice(1), root);
  } catch (e) {
    if (e.message === 'not-exist') {
      return null;
    }

    throw e;
  }

  if (!file.contents) {
    // File is a dynamic import that hasn't been loaded
    return null;
  }

  if (contents) {
    replaceFileContent(file, contents);
  }

  // Clear cached exports
  // TODO: check how this affects live bindings for ecmascript modules
  delete file.module.exports;
  const entry = ReifyEntry.getOrCreate(id);
  entry.getters = {};
  entry.setters = {};
  entry.module = null;
  Object.keys(entry.namespace).forEach(key => {
    if (key !== '__esModule') {
      delete entry.namespace[key];
    }
  });

  return file;
}

function applyChangeset({
  changedFiles
}) {
  // TODO: prevent requiring removed files
  // TODO: install added files

  const reloadableParents = [];
  let hasImportedModules = false;

  changedFiles.forEach(({ content, path }) => {
    const file = module.replaceModule(path, content);

    // file will be null for dynamic imports that haven't been
    // imported
    if (file) {
      hasImportedModules = true;
      reloadableParents.push(...findReloadableParents({ self: file }));
    } else {
      console.log(`Unable to replace module ${path}. It is probably a dynamic file that hasn't been imported`);
    }
  });

  // Check if some of the module's parents are not reloadable
  // In that case, we have to do a full reload
  // TODO: record which parents cause this
  if (
    hasImportedModules &&
    reloadableParents.length === 0 ||
    reloadableParents.some(parent => !parent)
  ) {
    if (pendingReload) {
      return pendingReload();
    }
  }

  // TODO: deduplicate
  reloadableParents.forEach(parent => {
    rerunFile(parent);
  });
}

let nonRefreshableVersion = (__meteor_runtime_config__.autoupdate.versions || {})['web.browser'].versionNonRefreshable;

Meteor.startup(() => {
  if (!enabled) {
    return;
  }

  Package['autoupdate'].Autoupdate._clientVersions.watch((doc) => {
    if (doc._id !== 'web.browser') {
      return;
    }

    // We can't do anything here until Reload._onMigrate
    // has been called
    if (!pendingReload) {
      return;
    }

    if (doc.versionNonRefreshable !== nonRefreshableVersion) {
      requestChanges();
      nonRefreshableVersion = doc.versionNonRefreshable;
    }
  });

  // We disable hot code push for js until there were
  // changes that can not be applied through HMR.
  Package['reload'].Reload._onMigrate((tryReload) => {
    if (mustReload) {
      return [true];
    }

    pendingReload = tryReload;
    requestChanges();

    return [false];
  });
});
