import { DDP } from '../common/namespace.js';
import { Meteor } from 'meteor/meteor';
import { isEmpty, last } from "meteor/ddp-common/utils.js";
// Meteor.refresh can be called on the client (if you're in common code) but it
// only has an effect on the server.
Meteor.refresh = () => {};

// By default, try to connect back to the same endpoint as the page
// was served from.
//
// XXX We should be doing this a different way. Right now we don't
// include ROOT_URL_PATH_PREFIX when computing ddpUrl. (We don't
// include it on the server when computing
// DDP_DEFAULT_CONNECTION_URL, and we don't include it in our
// default, '/'.) We get by with this because DDP.connect then
// forces the URL passed to it to be interpreted relative to the
// app's deploy path, even if it is absolute. Instead, we should
// make DDP_DEFAULT_CONNECTION_URL, if set, include the path prefix;
// make the default ddpUrl be '' rather that '/'; and make
// _translateUrl in stream_client_common.js not force absolute paths
// to be treated like relative paths. See also
// stream_client_common.js #RationalizingRelativeDDPURLs
const runtimeConfig = typeof __meteor_runtime_config__ !== 'undefined' ? __meteor_runtime_config__ : Object.create(null);
const ddpUrl = runtimeConfig.DDP_DEFAULT_CONNECTION_URL || '/';

const retry = new Retry();

function onDDPVersionNegotiationFailure(description) {
  Meteor._debug(description);
  if (Package.reload) {
    const migrationData = Package.reload.Reload._migrationData('livedata') || Object.create(null);
    let failures = migrationData.DDPVersionNegotiationFailures || 0;
    ++failures;
    Package.reload.Reload._onMigrate('livedata', () => [true, { DDPVersionNegotiationFailures: failures }]);
    retry.retryLater(failures, () => {
      Package.reload.Reload._reload({ immediateMigration: true });
    });
  }
}

Meteor.connection = DDP.connect(ddpUrl, {
  onDDPVersionNegotiationFailure: onDDPVersionNegotiationFailure
});


// https://forums.meteor.com/t/proposal-to-fix-issues-with-async-method-stubs/60826

let queueSize = 0;
let queue = Promise.resolve();

function queueFunction(fn) {
  queueSize += 1;

  let resolve;
  let reject;
  let promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  queue = queue.finally(() => {
    fn(resolve, reject);
    return promise;
  });

  promise.finally(() => {
    queueSize -= 1;
    if (queueSize === 0) {
      Meteor.connection._maybeMigrate();
    }
  });

  return promise;
}

let oldReadyToMigrate = Meteor.connection._readyToMigrate;
Meteor.connection._readyToMigrate = function () {
  if (queueSize > 0) {
    return false;
  }

  return oldReadyToMigrate.apply(this, arguments);
}


let currentMethodInvocation = null;

/**
 * Meteor sets CurrentMethodInvocation to undefined for the reasons explained at
 * https://github.com/meteor/meteor/blob/c9e3551b9673a7ed607f18cb1128563ff49ca96f/packages/ddp-client/common/livedata_connection.js#L578-L605
 * The app code could call `.then` on a promise while the async stub is running,
 * causing the `then` callback to think it is inside the stub.
 *
 * With the queueing we are doing, this is no longer necessary. The point
 * of the queueing is to prevent app/package code from running while
 * the stub is running, so we don't need to worry about this.
 */
let oldCallAsync = Meteor.connection.callAsync;
Meteor.connection.callAsync = function () {
  currentMethodInvocation = DDP._CurrentMethodInvocation.get();

  return oldCallAsync.apply(this, arguments);
}

let oldApplyAsync = Meteor.connection.applyAsync;
Meteor.connection.applyAsync = function () {
  let args = arguments;
  let name = args[0];

  if (currentMethodInvocation) {
    DDP._CurrentMethodInvocation._set(currentMethodInvocation);
    currentMethodInvocation = null;
  }

  const enclosing = DDP._CurrentMethodInvocation.get();
  const alreadyInSimulation = enclosing?.isSimulation;
  const isFromCallAsync = enclosing?._isFromCallAsync;

  if (Meteor.connection._getIsSimulation({
    isFromCallAsync, alreadyInSimulation
  })) {
    // In stub - call immediately
    return oldApplyAsync.apply(this, args);
  }

  return queueFunction((resolve, reject) => {
    let finished = false;
    Meteor._setImmediate(() => {
      oldApplyAsync.apply(this, args).then((result) => {
        finished = true;
        resolve(result);
      }, (err) => {
        finished = true;
        reject(err);
      });
    });

    Meteor._setImmediate(() => {
      if (!finished) {
        console.warn(`Method stub (${name}) took too long and could cause unexpected problems. Learn more at https://github.com/zodern/fix-async-stubs/#limitations`);
      }
    });
  });
};

let oldApply = Meteor.connection.apply;
Meteor.connection.apply = function () {
  // [name, args, options]
  let options = arguments[2] || {};
  let wait = options.wait;

  // Apply runs the stub before synchronously returning.
  //
  // However, we want the server to run the methods in the original call order
  // so we have to queue sending the message to the server until any previous async
  // methods run.
  // This does mean the stubs run in a different order than the methods on the
  // server.
  // TODO: can we queue Meteor.apply in some situations instead of running
  // immediately?

  let oldOutstandingMethodBlocks = Meteor.connection._outstandingMethodBlocks;
  // Meteor only sends the method if _outstandingMethodBlocks.length is 1.
  // Add a wait block to force Meteor to put the new method in a second block.
  let outstandingMethodBlocks = [{ wait: true, methods: [] }];
  Meteor.connection._outstandingMethodBlocks = outstandingMethodBlocks;

  let result;
  try {
    result = oldApply.apply(this, arguments);
  } finally {
    Meteor.connection._outstandingMethodBlocks = oldOutstandingMethodBlocks;
  }

  if (outstandingMethodBlocks[1]) {
    let methodInvoker = outstandingMethodBlocks[1].methods[0];

    if (methodInvoker) {
      queueMethodInvoker(methodInvoker, wait);
    }
  }

  return result;
};

function queueMethodInvoker(methodInvoker, wait) {
  queueFunction((resolve) => {
    let self = Meteor.connection;
    // based on https://github.com/meteor/meteor/blob/e0631738f2a8a914d8a50b1060e8f40cb0873680/packages/ddp-client/common/livedata_connection.js#L833-L853C1
    if (wait) {
      // It's a wait method! Wait methods go in their own block.
      self._outstandingMethodBlocks.push({
        wait: true,
        methods: [methodInvoker]
      });
    } else {
      // Not a wait method. Start a new block if the previous block was a wait
      // block, and add it to the last block of methods.
      if (isEmpty(self._outstandingMethodBlocks) ||
        last(self._outstandingMethodBlocks).wait) {
        self._outstandingMethodBlocks.push({
          wait: false,
          methods: [],
        });
      }

      last(self._outstandingMethodBlocks).methods.push(methodInvoker);
    }

    // If we added it to the first block, send it out now.
    if (self._outstandingMethodBlocks.length === 1) methodInvoker.sendMessage();

    resolve();
  });
}

/**
 * Queue subscriptions in case they rely on previous method calls
 */
let queueSend = false;
let oldSubscribe = Meteor.connection.subscribe;
Meteor.connection.subscribe = function () {
  queueSend = true;
  try {
    return oldSubscribe.apply(this, arguments);
  } finally {
    queueSend = false;
  }
};

let oldSend = Meteor.connection._send;
Meteor.connection._send = function () {
  if (!queueSend) {
    return oldSend.apply(this, arguments);
  }

  queueSend = false;
  queueFunction((resolve) => {
    try {
      oldSend.apply(this, arguments);
    } finally {
      resolve();
    }
  });
};

// Proxy the public methods of Meteor.connection so they can
// be called directly on Meteor.
[
  'subscribe',
  'methods',
  'isAsyncCall',
  'call',
  'callAsync',
  'apply',
  'applyAsync',
  'status',
  'reconnect',
  'disconnect'
].forEach(name => {
  Meteor[name] = Meteor.connection[name].bind(Meteor.connection);
});
