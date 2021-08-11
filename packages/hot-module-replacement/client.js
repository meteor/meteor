// TODO: add an api to Reify to update cached exports for a module
const ReifyEntry = require('/node_modules/meteor/modules/node_modules/reify/lib/runtime/entry.js')

const SOURCE_URL_PREFIX = "meteor://\u{1f4bb}app";

// Due to the bundler and proxy running in the same node process
// this could possibly be ran after the next build finished
// TODO: the builder should inject a build timestamp in the bundle
let lastUpdated = Date.now();
let appliedChangeSets = [];
let removeErrorMessage = null;

let arch = __meteor_runtime_config__.isModern ? 'web.browser' : 'web.browser.legacy';
const hmrSecret = __meteor_runtime_config__._hmrSecret;
let supportedArch = arch === 'web.browser';
const enabled = hmrSecret && supportedArch;

if (!supportedArch) {
  console.log(`HMR is not supported in ${arch}`);
}

if (!hmrSecret) {
  console.log('Restart Meteor to enable HMR');
}

const imported = Object.create(null);
const importedBy = Object.create(null);

if (module._onRequire) {
  module._onRequire({
    before(importedModule, parentId) {
      if (parentId === module.id) {
        // While applying updates we import modules to re-run them.
        // Don't track those imports since we don't want them to affect
        // if a future change to the file can be accepted
        return;
      }
      imported[parentId] = imported[parentId] || new Set();
      imported[parentId].add(importedModule.id);

      importedBy[importedModule.id] = importedBy[importedModule.id] || new Set();
      importedBy[importedModule.id].add(parentId);
    },
  });
}

let pendingReload = () => Package['reload'].Reload._reload({ immediateMigration: true });
let mustReload = false;
// Once an eager update fails, we stop processing future updates since they
// might depend on the failed update. This gets reset when we re-try applying
// the changes as non-eager updates.
let applyEagerUpdates = true;

function handleMessage(message) {
  if (message.type === 'register-failed') {
    if (message.reason === 'wrong-app') {
      console.log('HMR: A different app is running on', Meteor.absoluteUrl());
      console.log('HMR: Once you start this app again reload the page to re-enable HMR');
    } else if (message.reason === 'wrong-secret') {
      console.log('HMR: Have the wrong secret, probably because Meteor was restarted');
      console.log('HMR: Will enable HMR the next time the page is loaded');
      mustReload = true;
    } else {
      console.log(`HMR: Register failed for unknown reason`, message);
    }
    return;
  } else if (message.type === 'app-state') {
    if (removeErrorMessage) {
      removeErrorMessage();
    }

    if (message.state === 'error' && Package['dev-error-overlay']) {
      removeErrorMessage = Package['dev-error-overlay']
        .DevErrorOverlay
        .showMessage('Your app is crashing. Here are the latest logs:', message.log.join('\n'));
    }

    return;
  }

  if (message.type !== 'changes') {
    throw new Error(`Unknown HMR message type ${message.type}`);
  }

  if (message.eager && !applyEagerUpdates) {
    return;
  } else if (!message.eager) {
    // Now that the build has finished, we will finish handling any updates
    // that failed while being eagerly applied. Afterwards, we will either
    // fall back to hot code push, or be in a state where we can start handling
    // eager updates again
    applyEagerUpdates = true;
  }

  const hasUnreloadable = message.changeSets.find(changeSet => {
    return !changeSet.reloadable;
  });

  if (
    pendingReload &&
    hasUnreloadable ||
    message.changeSets.length === 0
  ) {
    if (message.eager) {
      // This was an attempt to reload before the build finishes
      // If we can't, we will wait until the build finishes to properly handle it
      // For now, we will disable eager updates in case future updates depended
      // on these
      applyEagerUpdates = false;
      return;
    }

    console.log('HMR: Unable to do HMR. Falling back to hot code push.')
    // Complete hot code push if we can not do hot module reload
    mustReload = true;
    return pendingReload();
  }

  // In case the user changed how a module works with HMR
  // in one of the earlier change sets, we want to apply each
  // change set one at a time in order.
  const succeeded = message.changeSets.filter(changeSet => {
    return !appliedChangeSets.includes(changeSet.id)
  }).every(changeSet => {
    const applied = applyChangeset(changeSet, message.eager);

    // We don't record if a module is unreplaceable
    // during an eager update so we can retry and
    // handle the failure after the build finishes
    if (applied || !message.eager) {
      appliedChangeSets.push(changeSet.id);
    }

    return applied;
  });

  if (message.eager) {
    // If there were any failures, we will stop applying eager updates for now
    // and wait until after the build finishes to handle the failures
    applyEagerUpdates = succeeded;
    return;
  }

  if (!succeeded) {
    if (pendingReload) {
      console.log('HMR: Some changes can not be applied with HMR. Using hot code push.')
      mustReload = true;
      return pendingReload();
    }

    throw new Error('HMR failed and unable to fallback to hot code push?');
  }

  if (message.changeSets.length > 0) {
    lastUpdated = message.changeSets[message.changeSets.length - 1].linkedAt;
  }
}

let socket;
let disconnected = false;
let pendingMessages = [];

function send(message) {
  if (socket) {
    socket.send(JSON.stringify(message));
  } else {
    pendingMessages.push(message);
  }
}

function connect() {
  if (mustReload) {
    // The page will reload, no reason to
    // connect and show more logs in the console
    return;
  }

  // If we've successfully connected and then was disconnected, we avoid showing
  // any more connection errors in the console until we've connected again
  let logDisconnect = !disconnected;
  let wsUrl = Meteor.absoluteUrl('__meteor__hmr__/websocket');
  const protocol = wsUrl.startsWith('https://') ? 'wss://' : 'ws://';
  wsUrl = wsUrl.replace(/^.+\/\//, protocol);
  socket = new WebSocket(wsUrl);

  socket.addEventListener('close', function () {
    socket = null;

    if (logDisconnect) {
      console.log('HMR: websocket closed');
    }

    disconnected = true;
    setTimeout(connect, 2000);
  });

  socket.addEventListener('open', function () {
    logDisconnect = true;
    disconnected = false;

    console.log('HMR: connected');
    socket.send(JSON.stringify({
      type: 'register',
      arch,
      secret: hmrSecret,
      appId: __meteor_runtime_config__.appId,
    }));

    const toSend = pendingMessages.slice();
    pendingMessages = [];

    toSend.forEach(message => {
      send(message);
    });
  });

  socket.addEventListener('message', function (event) {
    handleMessage(JSON.parse(event.data));
  });
}

if (enabled) {
  connect();
} else {
  // Always fall back to hot code push if HMR is disabled
  mustReload = true;
}

function requestChanges() {
  send({
    type: 'request-changes',
    arch,
    after: lastUpdated
  });
}

function walkTree(pathParts, tree) {
  const part = pathParts.shift();
  const _module = tree.contents[part];

  if (!_module) {
    console.log('HMR: file does not exist', part, pathParts, _module, tree);
    throw new Error('not-exist');
  }

  if (pathParts.length === 0) {
    return _module;
  }

  return walkTree(pathParts, _module);
}

function findFile(moduleId) {
  return walkTree(moduleId.split('/').slice(1), module._getRoot());
}

// btoa with unicode support
function utoa(data) {
  return btoa(unescape(encodeURIComponent(data)));
}

function createInlineSourceMap(map) {
  return "//# sourceMappingURL=data:application/json;base64," + utoa(JSON.stringify(map));
}

function createModuleContent (code, map) {
  return function () {
    return eval(
      // Wrap the function(require,exports,module){...} expression in
      // parentheses to force it to be parsed as an expression.
      // The sourceURL is treated as a prefix for the sources array
      // in the source map
      "(" + code + ")\n//# sourceURL=" + SOURCE_URL_PREFIX +
      "\n" + createInlineSourceMap(map)
    ).apply(this, arguments);
  }
}

function replaceFileContent(file, contents) {
  // TODO: to replace content in packages, we need an eval function that runs
  // within the package scope, like dynamic imports does.
  const moduleFunction = createModuleContent(contents.code, contents.map, file.module.id);

  file.contents = moduleFunction;
}

function checkModuleAcceptsUpdate(moduleId, checked) {
  checked.add(moduleId);
  
  if (moduleId === '/' ) {
    return false;
  }
  
  const file = findFile(moduleId);
  const moduleHot = file.module.hot;
  const moduleAccepts = moduleHot ? moduleHot._canAcceptUpdate() : false;

  if (moduleAccepts !== null) {
    return moduleAccepts;
  }

  let accepts = null;

  // The module did not accept the update. If the update is accepted depends
  // on if the modules that imported this module accept the update.
  importedBy[moduleId].forEach(depId => {
    if (depId === '/' && importedBy[moduleId].size > 1) {
      // This module was eagerly required by Meteor.
      // Meteor won't know if the module can be updated
      // but we can check with the other modules that imported it.
      return;
    }

    if (checked.has(depId)) {
      // There is a circular dependency
      return;
    }

    const depResult = checkModuleAcceptsUpdate(depId, checked);

    if (accepts !== false) {
      accepts = depResult;
    }
  });

  return accepts === null ? false : accepts;
}

function addFiles(addedFiles) {
  addedFiles.forEach(file => {
    const tree = {};
    const segments = file.path.split('/').slice(1);
    const fileName = segments.pop();

    let previous = tree;
    segments.forEach(segment => {
      previous[segment] = previous[segment] || {}
      previous = previous[segment]
    });
    previous[fileName] = createModuleContent(
      file.content.code,
      file.content.map,
      file.path
    );

    meteorInstall(tree, file.meteorInstallOptions);
  });
}

module.constructor.prototype._reset = function (id) {
  const moduleId = id || this.id;
  const file = findFile(moduleId);

  const hotState = file.module._hotState;

  const hotData = {};
  hotState._disposeHandlers.forEach(cb => {
    cb(hotData);
  });

  hotState.data = hotData;
  hotState._disposeHandlers = [];
  hotState._hotAccepts = null;


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

  if (imported[moduleId]) {
    imported[moduleId].forEach(depId => {
      importedBy[depId].delete(moduleId);
    });
    imported[moduleId] = new Set();
  }
}

module.constructor.prototype._replaceModule = function (id, contents) {
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
    return;
  }

  replaceFileContent(file, contents);

  if (!file.module.exports) {
    // File hasn't been imported.
    return;
  }
}

function applyChangeset({
  changedFiles,
  addedFiles
}) {
  let canApply = true;
  let toRerun = new Set();

  changedFiles.forEach(({ path }) => {
    const file = findFile(path);

    // Check if the file has been imported. If it hasn't been,
    // we can assume update to it can be accepted
    if (file.module.exports) {
      const checked = new Set();
      const accepts = checkModuleAcceptsUpdate(path, checked);

      if (canApply) {
        canApply = accepts;
        checked.forEach(moduleId => {
          toRerun.add(moduleId);
        });
      }
    }
  });

  if (!canApply) {
    return false;
  }


  changedFiles.forEach(({ content, path }) => {
    module._replaceModule(path, content);
  });

  if (addedFiles.length > 0) {
    addFiles(addedFiles);
  }

  toRerun.forEach(moduleId => {
    const file = findFile(moduleId);
    // clear module caches and hot state
    file.module._reset();
    file.module.loaded = false;
  });

  try {
    toRerun.forEach(moduleId => {
      require(moduleId);
    });
  } catch (error) {
    console.error('HMR: Error while applying changes:', error);
  }

  const updateCount = changedFiles.length + addedFiles.length;
  console.log(`HMR: updated ${updateCount} ${updateCount === 1 ? 'file' : 'files'}`);
  return true;
}

const initialVersions = (__meteor_runtime_config__.autoupdate.versions || {})['web.browser'];
let nonRefreshableVersion = initialVersions.versionNonRefreshable;
let replaceableVersion = initialVersions.versionReplaceable;

Meteor.startup(() => {
  if (!supportedArch) {
    return;
  }

  Package['autoupdate'].Autoupdate._clientVersions.watch((doc) => {
    if (doc._id !== 'web.browser') {
      return;
    }

    if (nonRefreshableVersion !== doc.versionNonRefreshable) {
      nonRefreshableVersion = doc.versionNonRefreshable;
      console.log('HMR: Some changes can not be applied with HMR. Using hot code push.')
      mustReload = true;
      pendingReload();
    } else if (doc.versionReplaceable !== replaceableVersion) {
      replaceableVersion = doc.versionReplaceable;
      if (enabled && !mustReload) {
        requestChanges();
      } else {
        mustReload = true;
        pendingReload();
      }
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
