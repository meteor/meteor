const {
  comparePrelinkResult
} = require('./changesets');

// Meteor can load the plugin multiple times
// when it is a local package
// Any state that should be preserved is stored in
// this object
const sharedState = global.__hotState || {
  initialized: false,
  wsServer: null,
  wsMessageHandler: null,
  prelinkResultHandler: null,
  previousPrelinkResults: {},
};
global.__hotState = sharedState;

function findLast(array, compare) {
  for (let i = array.length - 1; i > 0; i--) {
    if (compare(array[i])) {
      return array[i]
    }
  }
}

function prelinkResultHandler(prelinkResult) {
  const {
    isApp,
    name,
    bundleArch
  } = prelinkResult;

  // TODO: we should limit the number of change sets that are saved
  // to avoid a memory leak
  sharedState.previousPrelinkResults[bundleArch] =
    sharedState.previousPrelinkResults[bundleArch] || [];

  // TODO: support HMR in packages
  // TODO: support HMR in legacy bundle
  if (!isApp || bundleArch !== 'web.browser') {
    // Require a full reload whenever a package is modified
    sharedState.previousPrelinkResults[bundleArch].push({
      name,
      reloadable: false,
      linkedAt: Date.now()
    })
    return;
  }
  
  // TODO: Meteor should cache some of this data with the linker cache
  // so we have something to compare with when linking the first time
  // after meteor is started
  const changeSets = sharedState.previousPrelinkResults[bundleArch];
  let previousChangeset = findLast(changeSets, (changeSet) => {
    return changeSet.name === name;
  });

  const changeset = comparePrelinkResult(previousChangeset, prelinkResult);
  sharedState.previousPrelinkResults[bundleArch].push(changeset);
}

function wsMessageHandler(conn, _message) {
  const message = JSON.parse(_message);

  switch(message.type) {
    case 'request-changes': {
      const {
        after,
        arch
      } = message;

      const changesets = sharedState.previousPrelinkResults[arch] || [];
      const newChanges = changesets.filter(({ linkedAt }) => {
        return linkedAt > after;
      });

      conn.send(JSON.stringify({
        type: 'changes',
        changeSets: newChanges
      }));
      break;
    }

    default:
      console.warn('Unknown HMR message:', message.type);
  }
}

// Update handlers so event listeners added during initialization can
// use the latest handlers if this package was modified and rebuilt
sharedState.prelinkResultHandler = prelinkResultHandler;
sharedState.wsMessageHandler = wsMessageHandler;

function init() {
  sharedState.initialized = true;

  // TODO: port should be based on port app is using
  // TODO: look into using sockjs instead
  const WebSocket = require('ws');
  sharedState.wsServer = new WebSocket.Server({ port: 3124 });
  
  // TODO: should require connections to send a secret before
  // being able to receive changes
  sharedState.wsServer.on('connection', function (ws) {
    ws.on('message', (message) => {
      sharedState.wsMessageHandler(ws, message);
    });
  });

  Plugin._onPreLinked(function (prelinkResult) {
    sharedState.prelinkResultHandler(prelinkResult);
  });
}

if (!sharedState.initialized) {
  init();
}
