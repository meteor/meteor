// TODO: add an api to Reify to update cached exports for a module
const ReifyEntry = require('/node_modules/meteor/modules/node_modules/reify/lib/runtime/entry.js')

const SOURCE_URL_PREFIX = "meteor://\u{1f4bb}app";

// Due to the bundler and proxy running in the same node process
// this could possibly be ran after the next build finished
// TODO: the builder should inject a build timestamp in the bundle
let lastUpdated = Date.now();
let appliedChangeSets = [];
let reloadId = 0;

let arch = __meteor_runtime_config__.isModern ? 'web.browser' : 'web.browser.legacy';
let enabled = arch === 'web.browser';

if (!enabled) {
  console.log(`HMR is not supported in ${arch}`);
}

let pendingReload = () => Reload._reload({ immediateMigration: true });
let mustReload = false;

function handleMessage(message) {
  if (message.type === 'register-failed') {
    if (message.reason === 'wrong-app') {
      console.log('HMR: A different app is running on', Meteor.absoluteUrl());
      console.log('HMR: Once you start this app again reload the page to re-enable HMR');
    } else if (message.reason === 'wrong-secret') {
      // TODO: we could wait until the first update to use hot code push
      // instead of reloading the page immediately in case the user has any
      // client state they want to keep for now.
      console.log('HMR: Have the wrong secret, possibly because Meteor was restarted');
      console.log('HMR: Reloading page to get new secret');
      mustReload = true;
      pendingReload();
    } else {
      console.log(`HMR: Register failed for unknown reason`, message);
    }
    return;
  }

  if (message.type !== 'changes') {
    throw new Error(`Unknown HMR message type ${message.type}`);
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
    // We will ignore any failures at this time
    // and wait to handle them until the build finishes
    return;
  }

  if (!succeeded) {
    if (pendingReload) {
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

  const wsUrl = Meteor.absoluteUrl('/__meteor__hmr__/websocket').replace(/^.+\/\//, 'ws://');
  socket = new WebSocket(wsUrl);

  socket.addEventListener('close', function () {
    socket = null;
    console.log('HMR: websocket closed');
    setTimeout(connect, 2000);
  });

  socket.addEventListener('open', function () {
    console.log('HMR: connected');
    socket.send(JSON.stringify({
      type: 'register',
      arch,
      secret: __meteor_runtime_config__._hmrSecret,
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

  socket.addEventListener('error', console.error);
}

connect();

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
    if (parentFile.module.id === '/') {
      // Have reached the install tree's root. None of the modules have accepted this change
      return false;
    }

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

function addFiles(addedFiles) {
  console.log('HMR: Added files', addedFiles.map(file => file.path));

  addedFiles.forEach(file => {
    const tree = {};
    const segments = file.path.split('/').slice(1);
    const fileName = segments.pop();

    let previous = tree;
    segments.forEach(segment => {
      previous[segment] = previous[segment] || {}
      previous = previous[segment]
    });
    previous[fileName] = createModuleContent(file.content.code, file.content.map, file.path);

    meteorInstall(tree, file.meteorInstallOptions);
  });
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
    return false;
  }

  reloadId += 1;

  // TODO: handle errors
  const evaluated = [];
  reloadableParents.forEach(parent => {
    if (evaluated.includes(parent.module.id)) {
      return;
    }
    evaluated.push(parent.module.id);
    rerunFile(parent);
  });
  console.log('HMR: finished updating');
  return true;
}

const initialVersions = (__meteor_runtime_config__.autoupdate.versions || {})['web.browser'];
let nonRefreshableVersion = initialVersions.versionNonRefreshable;
let replaceableVersion = initialVersions.versionReplaceable;

Meteor.startup(() => {
  if (!enabled) {
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
      requestChanges();
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
