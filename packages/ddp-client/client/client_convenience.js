import { DDP } from '../common/namespace.js';
import { Meteor } from 'meteor/meteor';

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


// https://forums.meteor.com/t/proposal-to-fix-issues-with-async-method-stubs/60826/13
class Queue {
  constructor() {
    /**
     * @type {id: number[]}
     */
    this.queue = [];
    this.lastId = 0;
    /**
     * @type {number[]}
     */
    this.currentRunningStack = [];
  }

  /**
   * @param {<T>() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  push(fn) {
    this.lastId = this.lastId + 1;
    const id = this.lastId;
    this.queue.push(id);
    const stack = [...this.currentRunningStack]; // maybe this can be a performance issue
    return new Promise((resolve, reject) => {
      const internval = setInterval(() => {
        const deps = this.queue.filter(el => el < id && !stack.includes(el));

        if (deps.length > 0) return;

        clearInterval(internval);

        this.currentRunningStack.push(id);

        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.currentRunningStack.pop();
            this.queue = this.queue.filter(el => el !== id);
          });
      }, 10);
    });
  }
}
const queue = new Queue();
const originalApplyAsync = Meteor.applyAsync;
const originalCallAsync = Meteor.callAsync;

Meteor.applyAsync = (...args) => {
  // NOTE: make sure only isomorphic methods are globally executed in sequence.
  if (Meteor.connection._methodHandlers[args[0]]) {
    return queue.push(() => originalApplyAsync(...args));
  }

  return originalApplyAsync(...args);
};

Meteor.callAsync = (...args) => {
  // NOTE: make sure only isomorphic methods are globally executed in sequence.
  if (Meteor.connection._methodHandlers[args[0]]) {
    return queue.push(() => originalCallAsync(...args));
  }

  return originalCallAsync(...args);
};
