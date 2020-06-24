// TODO: add an api to Reify to update cached exports for a module
const ReifyEntry = require('/node_modules/meteor/modules/node_modules/reify/lib/runtime/entry.js')

// Due to the bundler and proxy running in the same node process
// this could possibly be ran after the next build finished
// TODO: the builder should inject the build time in the bundle
let lastUpdated = Date.now();
let appliedChangeSets = [];
let reloadId = 0;

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
  socket.send(JSON.stringify({
    type: 'register',
    arch
  }));
});

socket.addEventListener('message', function (event) {
  let message = JSON.parse(event.data);

  switch (message.type) {
    case 'changes':
      // TODO: support removed
      const hasUnreloadable = message.changeSets.find(changeSet => {
        return !changeSet.reloadable ||
          changeSet.removedFilePaths.length > 0
      })

      if (
        pendingReload &&
        hasUnreloadable ||
        message.changeSets.length === 0
      ) {
        // This was an attempt to reload before the build finishes
        // If we can't, we will wait until the build finishes to properly handle it
        if (message.eager) {
          return
        }

        console.log('HMR: Unable to do HMR. Falling back to hot code push.')
        // Complete hot code push if we can not do hot module reload
        mustReload = true;
        return pendingReload();
      }

      // In case the user changed how a module works with HMR
      // in one of the earlier change sets, we want to apply each
      // change set one at a time.
      message.changeSets.filter(changeSet => {
        return !appliedChangeSets.includes(changeSet.id)
      }).forEach(changeSet => {
        appliedChangeSets.push(changeSet.id);
        applyChangeset(changeSet);
      });

      if (!message.eager && message.changeSets.length > 0) {
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

function createModuleContent (code, map, id) {
  return function () {
    // TODO: Use same sourceURL as the sourcemap for the main bundle does
    return eval(
      // Wrap the function(require,exports,module){...} expression in
      // parentheses to force it to be parsed as an expression.
      "(" + code + ")\n//# sourceURL=" + id +
      "\n" + createInlineSourceMap(map)
    ).apply(this, arguments);
  }

}

function replaceFileContent(file, contents) {
  console.log('HMR: replacing module:', file.module.id);

  // TODO: to replace content in packages, we need an eval function that runs
  // within the package scope, like dynamic imports does.
  const moduleFunction = createModuleContent(contents.code, contents.map, file.module.id);

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

function addFiles(files) {
  const tree = {};

  console.log('HMR: Added files', files.map(file => file.path));

  files.forEach(file => {
    const segments = file.path.split('/').slice(1);
    let previous = tree;
    segments.splice(0, segments.length - 1).forEach(segment => {
      previous[segment] = previous[segment] || {}
      previous = previous[segment]
    })
    previous[segments[0]] = createModuleContent(file.content.code, file.content.map, file.path);
  })

  // TODO: group the files by meteorInstallOptions
  meteorInstall(tree, files[0].meteorInstallOptions);
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

  const hotState = file.module._hotState;
  if (file._reloadedAt !== reloadId && hotState) {
    file._reloadedAt = reloadId;

    const hotData = {};
    hotState._disposeHandlers.forEach(cb => {
      cb(hotData);
    });
    hotState._disposeHandlers = [];
    hotState.data = hotData;
  }

  if (contents) {
    replaceFileContent(file, contents);
  }

  // Clear cached exports
  // TODO: check how this affects live bindings for ecmascript modules
  delete file.module.exports;
  const entry = ReifyEntry.getOrCreate(moduleId);
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
  changedFiles,
  addedFiles
}) {
  // TODO: prevent requiring removed files
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

  if (addedFiles.length > 0) {
    addFiles(addedFiles);
  }

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

  reloadId += 1;

  // TODO: deduplicate
  // TODO: handle errors
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
      nonRefreshableVersion = doc.versionNonRefreshable;

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
