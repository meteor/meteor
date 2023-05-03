// TODO: add an api to Reify to update cached exports for a module
var ReifyEntry = require('/node_modules/meteor/modules/node_modules/@meteorjs/reify/lib/runtime/entry.js')

var SOURCE_URL_PREFIX = "meteor://\ud83d\udcbbapp";

var appliedChangeSets = [];
var removeErrorMessage = null;

var arch = Meteor.isCordova ? "web.cordova" :
  Meteor.isModern ? "web.browser" : "web.browser.legacy";

var initialVersions = __meteor_runtime_config__.autoupdate.versions[arch];
var lastUpdated = initialVersions.versionHmr;
var hmrSecret = __meteor_runtime_config__._hmrSecret;

// Cordova doesn't need the hmrSecret, though cordova is also unable to tell
// if Meteor needs to be restarted to enable HMR;
var enabled = Meteor.isCordova || !!hmrSecret;

if (!enabled) {
  console.log('Restart Meteor to enable HMR');
}

var imported = Object.create(null);
var importedBy = Object.create(null);

if (module._onRequire) {
  module._onRequire({
    before: function (importedModule, parentId) {
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

// On web, we can reload the page any time to get the new version. On cordova,
// we have to wait until Reload._onMigrate is called
var hotCodePushReady = arch !== 'web.cordova';

var useHotCodePush = false;
var forceReload = function () {
  useHotCodePush = true;
  // Wait until Reload package has been loaded
  Meteor.startup(function () {
    if (hotCodePushReady) {
      Package['reload'].Reload._reload();
    }
  });
};

// Once an eager update fails, we stop processing future updates since they
// might depend on the failed update. This gets reset when we re-try applying
// the changes as non-eager updates.
var applyEagerUpdates = true;

function handleMessage(message) {
  if (message.type === 'register-failed') {
    if (message.reason === 'wrong-app') {
      console.log('HMR: A different app is running on', Meteor.absoluteUrl());
      console.log('HMR: Once you start this app again reload the page to re-enable HMR');
    } else if (message.reason === 'wrong-secret') {
      console.log('HMR: Have the wrong secret, probably because Meteor was restarted');
      console.log('HMR: Will enable HMR the next time the page is loaded');
      useHotCodePush = true;
    } else {
      console.log('HMR: Register failed for unknown reason', message);
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
    throw new Error('Unknown HMR message type ' + message.type);
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

  var hasUnreloadable = message.changeSets.find(function (changeSet) {
    return !changeSet.reloadable;
  });

  if (
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

    console.log('HMR: Unable to do HMR. Falling back to hot code push.');
    // Complete hot code push if we can not do hot module reload
    return forceReload();
  }

  // In case the user changed how a module works with HMR
  // in one of the earlier change sets, we want to apply each
  // change set one at a time in order.
  var succeeded = message.changeSets.filter(function (changeSet) {
    return !appliedChangeSets.includes(changeSet.id)
  }).every(function (changeSet) {
    var applied = applyChangeset(changeSet, message.eager);

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
    console.log('HMR: Some changes can not be applied with HMR. Using hot code push.')

    forceReload();
    return;
  }

  if (message.changeSets.length > 0) {
    lastUpdated = message.changeSets[message.changeSets.length - 1].linkedAt;
  }
}

var socket;
var disconnected = false;
var pendingMessages = [];

function send(message) {
  if (socket) {
    socket.send(JSON.stringify(message));
  } else {
    pendingMessages.push(message);
  }
}

function connect() {
  if (useHotCodePush) {
    // The page will reload, no reason to
    // connect and show more logs in the console
    return;
  }

  // If we've successfully connected and then was disconnected, we avoid showing
  // any more connection errors in the console until we've connected again
  var logDisconnect = !disconnected;
  var wsUrl = Meteor.absoluteUrl('__meteor__hmr__/websocket');
  var protocol = wsUrl.startsWith('https://') ? 'wss://' : 'ws://';
  wsUrl = wsUrl.replace(/^.+\/\//, protocol);
  socket = new WebSocket(wsUrl);

  socket.addEventListener('close', function () {
    socket = null;

    if (logDisconnect && !useHotCodePush) {
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
      arch: arch,
      secret: hmrSecret,
      appId: __meteor_runtime_config__.appId,
    }));

    var toSend = pendingMessages.slice();
    pendingMessages = [];

    toSend.forEach(function (message) {
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
  useHotCodePush = true;
}

function requestChanges() {
  send({
    type: 'request-changes',
    arch: arch,
    after: lastUpdated
  });
}

function walkTree(pathParts, tree) {
  var part = pathParts.shift();
  var _module = tree.contents[part];

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
  var moduleFunction = createModuleContent(contents.code, contents.map, file.module.id);

  file.contents = moduleFunction;
}

function checkModuleAcceptsUpdate(moduleId, checked) {
  checked.add(moduleId);

  if (moduleId === '/' ) {
    return false;
  }

  var file = findFile(moduleId);
  var moduleHot = file.module.hot;
  var moduleAccepts = moduleHot ? moduleHot._canAcceptUpdate() : false;

  if (moduleAccepts !== null) {
    return moduleAccepts;
  }

  var accepts = null;

  // The module did not accept the update. If the update is accepted depends
  // on if the modules that imported this module accept the update.
  importedBy[moduleId].forEach(function (depId) {
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

    var depResult = checkModuleAcceptsUpdate(depId, checked);

    if (accepts !== false) {
      accepts = depResult;
    }
  });

  return accepts === null ? false : accepts;
}

function addFiles(addedFiles) {
  addedFiles.forEach(function (file) {
    var tree = {};
    var segments = file.path.split('/').slice(1);
    var fileName = segments.pop();

    var previous = tree;
    segments.forEach(function (segment) {
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
  var moduleId = id || this.id;
  var file = findFile(moduleId);

  var hotState = file.module._hotState;

  var hotData = {};
  hotState._disposeHandlers.forEach(function (cb) {
    cb(hotData);
  });

  hotState.data = hotData;
  hotState._disposeHandlers = [];
  hotState._hotAccepts = null;


  // Clear cached exports
  // TODO: check how this affects live bindings for ecmascript modules
  delete file.module.exports;
  var entry = ReifyEntry.getOrCreate(moduleId);
  entry.getters = {};
  entry.setters = {};
  entry.module = null;
  Object.keys(entry.namespace).forEach(function (key) {
    if (key !== '__esModule') {
      delete entry.namespace[key];
    }
  });

  if (imported[moduleId]) {
    imported[moduleId].forEach(function (depId) {
      importedBy[depId].delete(moduleId);
    });
    imported[moduleId] = new Set();
  }
}

module.constructor.prototype._replaceModule = function (id, contents) {
  var moduleId = id || this.id;
  var root = this._getRoot();

  var file;
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

function applyChangeset(options) {
  var changedFiles = options.changedFiles;
  var addedFiles = options.addedFiles;

  var canApply = true;
  var toRerun = new Set();

  changedFiles.forEach(function (changed) {
    var path = changed.path;
    var file = findFile(path);

    // Check if the file has been imported. If it hasn't been,
    // we can assume update to it can be accepted
    if (file.module.exports) {
      var checked = new Set();
      var accepts = checkModuleAcceptsUpdate(path, checked);

      if (canApply) {
        canApply = accepts;
        checked.forEach(function (moduleId) {
          toRerun.add(moduleId);
        });
      }
    }
  });

  if (!canApply) {
    return false;
  }

  changedFiles.forEach(function (changedFile) {
    module._replaceModule(changedFile.path, changedFile.content);
  });

  if (addedFiles.length > 0) {
    addFiles(addedFiles);
  }

  toRerun.forEach(function (moduleId) {
    var file = findFile(moduleId);
    // clear module caches and hot state
    file.module._reset();
    file.module.loaded = false;
  });

  try {
    toRerun.forEach(function (moduleId) {
      require(moduleId);
    });
  } catch (error) {
    console.error('HMR: Error while applying changes:', error);
  }

  var updateCount = changedFiles.length + addedFiles.length;
  console.log('HMR: updated ' + updateCount + ' ' + (updateCount === 1 ? 'file' : 'files'));
  return true;
}

var nonRefreshableVersion = initialVersions.versionNonRefreshable;
var replaceableVersion = initialVersions.versionReplaceable;

Meteor.startup(function () {
  if (!enabled) {
    return;
  }

  Package['autoupdate'].Autoupdate._clientVersions.watch(function (doc) {
    if (doc._id !== arch) {
      return;
    }

    if (nonRefreshableVersion !== doc.versionNonRefreshable) {
      nonRefreshableVersion = doc.versionNonRefreshable;
      console.log('HMR: Some changes can not be applied with HMR. Using hot code push.')
      forceReload();
    } else if (doc.versionReplaceable !== replaceableVersion) {
      replaceableVersion = doc.versionReplaceable;

      if (useHotCodePush) {
        return forceReload();
      }

      requestChanges();
    }
  });

  Package['reload'].Reload._onMigrate(function () {
    if (useHotCodePush) {
      return [true];
    }

    hotCodePushReady = true;
    return [false];
  });
});
