import { Meteor } from 'meteor/meteor';
import { DDPCommon } from 'meteor/ddp-common';
import { Tracker } from 'meteor/tracker';
import { EJSON } from 'meteor/ejson';
import { Random } from 'meteor/random';
import { MongoID } from 'meteor/mongo-id';
import { DDP } from './namespace.js';
import { MethodInvoker } from './method_invoker';
import {
  hasOwn,
  slice,
  keys,
  isEmpty,
  last,
} from "meteor/ddp-common/utils";
import { ConnectionStreamHandlers } from './connection_stream_handlers';
import { MongoIDMap } from './mongo_id_map';
import { MessageProcessors } from './message_processors';
import { DocumentProcessors } from './document_processors';

// @param url {String|Object} URL to Meteor app,
//   or an object as a test hook (see code)
// Options:
//   reloadWithOutstanding: is it OK to reload if there are outstanding methods?
//   headers: extra headers to send on the websockets connection, for
//     server-to-server DDP only
//   _sockjsOptions: Specifies options to pass through to the sockjs client
//   onDDPNegotiationVersionFailure: callback when version negotiation fails.
//
// XXX There should be a way to destroy a DDP connection, causing all
// outstanding method calls to fail.
//
// XXX Our current way of handling failure and reconnection is great
// for an app (where we want to tolerate being disconnected as an
// expect state, and keep trying forever to reconnect) but cumbersome
// for something like a command line tool that wants to make a
// connection, call a method, and print an error if connection
// fails. We should have better usability in the latter case (while
// still transparently reconnecting if it's just a transient failure
// or the server migrating us).
export class Connection {
  constructor(url, options) {
    const self = this;

    this.options = options = {
      onConnected() {},
      onDDPVersionNegotiationFailure(description) {
        Meteor._debug(description);
      },
      heartbeatInterval: 17500,
      heartbeatTimeout: 15000,
      npmFayeOptions: Object.create(null),
      // These options are only for testing.
      reloadWithOutstanding: false,
      supportedDDPVersions: DDPCommon.SUPPORTED_DDP_VERSIONS,
      retry: true,
      respondToPings: true,
      // When updates are coming within this ms interval, batch them together.
      bufferedWritesInterval: 5,
      // Flush buffers immediately if writes are happening continuously for more than this many ms.
      bufferedWritesMaxAge: 500,

      ...options
    };

    // If set, called when we reconnect, queuing method calls _before_ the
    // existing outstanding ones.
    // NOTE: This feature has been preserved for backwards compatibility. The
    // preferred method of setting a callback on reconnect is to use
    // DDP.onReconnect.
    self.onReconnect = null;

    // as a test hook, allow passing a stream instead of a url.
    if (typeof url === 'object') {
      self._stream = url;
    } else {
      import { ClientStream } from "meteor/socket-stream-client";

      self._stream = new ClientStream(url, {
        retry: options.retry,
        ConnectionError: DDP.ConnectionError,
        headers: options.headers,
        _sockjsOptions: options._sockjsOptions,
        // Used to keep some tests quiet, or for other cases in which
        // the right thing to do with connection errors is to silently
        // fail (e.g. sending package usage stats). At some point we
        // should have a real API for handling client-stream-level
        // errors.
        _dontPrintErrors: options._dontPrintErrors,
        connectTimeoutMs: options.connectTimeoutMs,
        npmFayeOptions: options.npmFayeOptions
      });
    }

    self._lastSessionId = null;
    self._versionSuggestion = null; // The last proposed DDP version.
    self._version = null; // The DDP version agreed on by client and server.
    self._stores = Object.create(null); // name -> object with methods
    self._methodHandlers = Object.create(null); // name -> func
    self._nextMethodId = 1;
    self._supportedDDPVersions = options.supportedDDPVersions;

    self._heartbeatInterval = options.heartbeatInterval;
    self._heartbeatTimeout = options.heartbeatTimeout;

    // Tracks methods which the user has tried to call but which have not yet
    // called their user callback (ie, they are waiting on their result or for all
    // of their writes to be written to the local cache). Map from method ID to
    // MethodInvoker object.
    self._methodInvokers = Object.create(null);

    // Tracks methods which the user has called but whose result messages have not
    // arrived yet.
    //
    // _outstandingMethodBlocks is an array of blocks of methods. Each block
    // represents a set of methods that can run at the same time. The first block
    // represents the methods which are currently in flight; subsequent blocks
    // must wait for previous blocks to be fully finished before they can be sent
    // to the server.
    //
    // Each block is an object with the following fields:
    // - methods: a list of MethodInvoker objects
    // - wait: a boolean; if true, this block had a single method invoked with
    //         the "wait" option
    //
    // There will never be adjacent blocks with wait=false, because the only thing
    // that makes methods need to be serialized is a wait method.
    //
    // Methods are removed from the first block when their "result" is
    // received. The entire first block is only removed when all of the in-flight
    // methods have received their results (so the "methods" list is empty) *AND*
    // all of the data written by those methods are visible in the local cache. So
    // it is possible for the first block's methods list to be empty, if we are
    // still waiting for some objects to quiesce.
    //
    // Example:
    //  _outstandingMethodBlocks = [
    //    {wait: false, methods: []},
    //    {wait: true, methods: [<MethodInvoker for 'login'>]},
    //    {wait: false, methods: [<MethodInvoker for 'foo'>,
    //                            <MethodInvoker for 'bar'>]}]
    // This means that there were some methods which were sent to the server and
    // which have returned their results, but some of the data written by
    // the methods may not be visible in the local cache. Once all that data is
    // visible, we will send a 'login' method. Once the login method has returned
    // and all the data is visible (including re-running subs if userId changes),
    // we will send the 'foo' and 'bar' methods in parallel.
    self._outstandingMethodBlocks = [];

    // method ID -> array of objects with keys 'collection' and 'id', listing
    // documents written by a given method's stub. keys are associated with
    // methods whose stub wrote at least one document, and whose data-done message
    // has not yet been received.
    self._documentsWrittenByStub = {};
    // collection -> IdMap of "server document" object. A "server document" has:
    // - "document": the version of the document according the
    //   server (ie, the snapshot before a stub wrote it, amended by any changes
    //   received from the server)
    //   It is undefined if we think the document does not exist
    // - "writtenByStubs": a set of method IDs whose stubs wrote to the document
    //   whose "data done" messages have not yet been processed
    self._serverDocuments = {};

    // Array of callbacks to be called after the next update of the local
    // cache. Used for:
    //  - Calling methodInvoker.dataVisible and sub ready callbacks after
    //    the relevant data is flushed.
    //  - Invoking the callbacks of "half-finished" methods after reconnect
    //    quiescence. Specifically, methods whose result was received over the old
    //    connection (so we don't re-send it) but whose data had not been made
    //    visible.
    self._afterUpdateCallbacks = [];

    // In two contexts, we buffer all incoming data messages and then process them
    // all at once in a single update:
    //   - During reconnect, we buffer all data messages until all subs that had
    //     been ready before reconnect are ready again, and all methods that are
    //     active have returned their "data done message"; then
    //   - During the execution of a "wait" method, we buffer all data messages
    //     until the wait method gets its "data done" message. (If the wait method
    //     occurs during reconnect, it doesn't get any special handling.)
    // all data messages are processed in one update.
    //
    // The following fields are used for this "quiescence" process.

    // This buffers the messages that aren't being processed yet.
    self._messagesBufferedUntilQuiescence = [];
    // Map from method ID -> true. Methods are removed from this when their
    // "data done" message is received, and we will not quiesce until it is
    // empty.
    self._methodsBlockingQuiescence = {};
    // map from sub ID -> true for subs that were ready (ie, called the sub
    // ready callback) before reconnect but haven't become ready again yet
    self._subsBeingRevived = {}; // map from sub._id -> true
    // if true, the next data update should reset all stores. (set during
    // reconnect.)
    self._resetStores = false;

    // name -> array of updates for (yet to be created) collections
    self._updatesForUnknownStores = {};
    // if we're blocking a migration, the retry func
    self._retryMigrate = null;
    // Collection name -> array of messages.
    self._bufferedWrites = {};
    // When current buffer of updates must be flushed at, in ms timestamp.
    self._bufferedWritesFlushAt = null;
    // Timeout handle for the next processing of all pending writes
    self._bufferedWritesFlushHandle = null;

    self._bufferedWritesInterval = options.bufferedWritesInterval;
    self._bufferedWritesMaxAge = options.bufferedWritesMaxAge;

    // metadata for subscriptions.  Map from sub ID to object with keys:
    //   - id
    //   - name
    //   - params
    //   - inactive (if true, will be cleaned up if not reused in re-run)
    //   - ready (has the 'ready' message been received?)
    //   - readyCallback (an optional callback to call when ready)
    //   - errorCallback (an optional callback to call if the sub terminates with
    //                    an error, XXX COMPAT WITH 1.0.3.1)
    //   - stopCallback (an optional callback to call when the sub terminates
    //     for any reason, with an error argument if an error triggered the stop)
    self._subscriptions = {};

    // Reactive userId.
    self._userId = null;
    self._userIdDeps = new Tracker.Dependency();

    // Block auto-reload while we're waiting for method responses.
    if (Meteor.isClient &&
      Package.reload &&
      ! options.reloadWithOutstanding) {
      Package.reload.Reload._onMigrate(retry => {
        if (! self._readyToMigrate()) {
          self._retryMigrate = retry;
          return [false];
        } else {
          return [true];
        }
      });
    }

    this._streamHandlers = new ConnectionStreamHandlers(this);

    const onDisconnect = () => {
      if (this._heartbeat) {
        this._heartbeat.stop();
        this._heartbeat = null;
      }
    };

    if (Meteor.isServer) {
      this._stream.on(
        'message',
        Meteor.bindEnvironment(
          msg => this._streamHandlers.onMessage(msg),
          'handling DDP message'
        )
      );
      this._stream.on(
        'reset',
        Meteor.bindEnvironment(
          () => this._streamHandlers.onReset(),
          'handling DDP reset'
        )
      );
      this._stream.on(
        'disconnect',
        Meteor.bindEnvironment(onDisconnect, 'handling DDP disconnect')
      );
    } else {
      this._stream.on('message', msg => this._streamHandlers.onMessage(msg));
      this._stream.on('reset', () => this._streamHandlers.onReset());
      this._stream.on('disconnect', onDisconnect);
    }

    this._messageProcessors = new MessageProcessors(this);

    // Expose message processor methods to maintain backward compatibility
    this._livedata_connected = (msg) => this._messageProcessors._livedata_connected(msg);
    this._livedata_data = (msg) => this._messageProcessors._livedata_data(msg);
    this._livedata_nosub = (msg) => this._messageProcessors._livedata_nosub(msg);
    this._livedata_result = (msg) => this._messageProcessors._livedata_result(msg);
    this._livedata_error = (msg) => this._messageProcessors._livedata_error(msg);

    this._documentProcessors = new DocumentProcessors(this);

    // Expose document processor methods to maintain backward compatibility
    this._process_added = (msg, updates) => this._documentProcessors._process_added(msg, updates);
    this._process_changed = (msg, updates) => this._documentProcessors._process_changed(msg, updates);
    this._process_removed = (msg, updates) => this._documentProcessors._process_removed(msg, updates);
    this._process_ready = (msg, updates) => this._documentProcessors._process_ready(msg, updates);
    this._process_updated = (msg, updates) => this._documentProcessors._process_updated(msg, updates);

    // Also expose utility methods used by other parts of the system
    this._pushUpdate = (updates, collection, msg) =>
      this._documentProcessors._pushUpdate(updates, collection, msg);
    this._getServerDoc = (collection, id) =>
      this._documentProcessors._getServerDoc(collection, id);
  }

  // 'name' is the name of the data on the wire that should go in the
  // store. 'wrappedStore' should be an object with methods beginUpdate, update,
  // endUpdate, saveOriginals, retrieveOriginals. see Collection for an example.
  createStoreMethods(name, wrappedStore) {
    const self = this;

    if (name in self._stores) return false;

    // Wrap the input object in an object which makes any store method not
    // implemented by 'store' into a no-op.
    const store = Object.create(null);
    const keysOfStore = [
      'update',
      'beginUpdate',
      'endUpdate',
      'saveOriginals',
      'retrieveOriginals',
      'getDoc',
      '_getCollection'
    ];
    keysOfStore.forEach((method) => {
      store[method] = (...args) => {
        if (wrappedStore[method]) {
          return wrappedStore[method](...args);
        }
      };
    });
    self._stores[name] = store;
    return store;
  }

  registerStoreClient(name, wrappedStore) {
    const self = this;

    const store = self.createStoreMethods(name, wrappedStore);

    const queued = self._updatesForUnknownStores[name];
    if (Array.isArray(queued)) {
      store.beginUpdate(queued.length, false);
      queued.forEach(msg => {
        store.update(msg);
      });
      store.endUpdate();
      delete self._updatesForUnknownStores[name];
    }

    return true;
  }
  async registerStoreServer(name, wrappedStore) {
    const self = this;

    const store = self.createStoreMethods(name, wrappedStore);

    const queued = self._updatesForUnknownStores[name];
    if (Array.isArray(queued)) {
      await store.beginUpdate(queued.length, false);
      for (const msg of queued) {
        await store.update(msg);
      }
      await store.endUpdate();
      delete self._updatesForUnknownStores[name];
    }

    return true;
  }

  /**
   * @memberOf Meteor
   * @importFromPackage meteor
   * @alias Meteor.subscribe
   * @summary Subscribe to a record set.  Returns a handle that provides
   * `stop()` and `ready()` methods.
   * @locus Client
   * @param {String} name Name of the subscription.  Matches the name of the
   * server's `publish()` call.
   * @param {EJSONable} [arg1,arg2...] Optional arguments passed to publisher
   * function on server.
   * @param {Function|Object} [callbacks] Optional. May include `onStop`
   * and `onReady` callbacks. If there is an error, it is passed as an
   * argument to `onStop`. If a function is passed instead of an object, it
   * is interpreted as an `onReady` callback.
   */
  subscribe(name /* .. [arguments] .. (callback|callbacks) */) {
    const self = this;

    const params = slice.call(arguments, 1);
    let callbacks = Object.create(null);
    if (params.length) {
      const lastParam = params[params.length - 1];
      if (typeof lastParam === 'function') {
        callbacks.onReady = params.pop();
      } else if (lastParam && [
        lastParam.onReady,
        // XXX COMPAT WITH 1.0.3.1 onError used to exist, but now we use
        // onStop with an error callback instead.
        lastParam.onError,
        lastParam.onStop
      ].some(f => typeof f === "function")) {
        callbacks = params.pop();
      }
    }

    // Is there an existing sub with the same name and param, run in an
    // invalidated Computation? This will happen if we are rerunning an
    // existing computation.
    //
    // For example, consider a rerun of:
    //
    //     Tracker.autorun(function () {
    //       Meteor.subscribe("foo", Session.get("foo"));
    //       Meteor.subscribe("bar", Session.get("bar"));
    //     });
    //
    // If "foo" has changed but "bar" has not, we will match the "bar"
    // subcribe to an existing inactive subscription in order to not
    // unsub and resub the subscription unnecessarily.
    //
    // We only look for one such sub; if there are N apparently-identical subs
    // being invalidated, we will require N matching subscribe calls to keep
    // them all active.
    const existing = Object.values(self._subscriptions).find(
      sub => (sub.inactive && sub.name === name && EJSON.equals(sub.params, params))
    );

    let id;
    if (existing) {
      id = existing.id;
      existing.inactive = false; // reactivate

      if (callbacks.onReady) {
        // If the sub is not already ready, replace any ready callback with the
        // one provided now. (It's not really clear what users would expect for
        // an onReady callback inside an autorun; the semantics we provide is
        // that at the time the sub first becomes ready, we call the last
        // onReady callback provided, if any.)
        // If the sub is already ready, run the ready callback right away.
        // It seems that users would expect an onReady callback inside an
        // autorun to trigger once the sub first becomes ready and also
        // when re-subs happens.
        if (existing.ready) {
          callbacks.onReady();
        } else {
          existing.readyCallback = callbacks.onReady;
        }
      }

      // XXX COMPAT WITH 1.0.3.1 we used to have onError but now we call
      // onStop with an optional error argument
      if (callbacks.onError) {
        // Replace existing callback if any, so that errors aren't
        // double-reported.
        existing.errorCallback = callbacks.onError;
      }

      if (callbacks.onStop) {
        existing.stopCallback = callbacks.onStop;
      }
    } else {
      // New sub! Generate an id, save it locally, and send message.
      id = Random.id();
      self._subscriptions[id] = {
        id: id,
        name: name,
        params: EJSON.clone(params),
        inactive: false,
        ready: false,
        readyDeps: new Tracker.Dependency(),
        readyCallback: callbacks.onReady,
        // XXX COMPAT WITH 1.0.3.1 #errorCallback
        errorCallback: callbacks.onError,
        stopCallback: callbacks.onStop,
        connection: self,
        remove() {
          delete this.connection._subscriptions[this.id];
          this.ready && this.readyDeps.changed();
        },
        stop() {
          this.connection._sendQueued({ msg: 'unsub', id: id });
          this.remove();

          if (callbacks.onStop) {
            callbacks.onStop();
          }
        }
      };
      self._send({ msg: 'sub', id: id, name: name, params: params });
    }

    // return a handle to the application.
    const handle = {
      stop() {
        if (! hasOwn.call(self._subscriptions, id)) {
          return;
        }
        self._subscriptions[id].stop();
      },
      ready() {
        // return false if we've unsubscribed.
        if (!hasOwn.call(self._subscriptions, id)) {
          return false;
        }
        const record = self._subscriptions[id];
        record.readyDeps.depend();
        return record.ready;
      },
      subscriptionId: id
    };

    if (Tracker.active) {
      // We're in a reactive computation, so we'd like to unsubscribe when the
      // computation is invalidated... but not if the rerun just re-subscribes
      // to the same subscription!  When a rerun happens, we use onInvalidate
      // as a change to mark the subscription "inactive" so that it can
      // be reused from the rerun.  If it isn't reused, it's killed from
      // an afterFlush.
      Tracker.onInvalidate((c) => {
        if (hasOwn.call(self._subscriptions, id)) {
          self._subscriptions[id].inactive = true;
        }

        Tracker.afterFlush(() => {
          if (hasOwn.call(self._subscriptions, id) &&
              self._subscriptions[id].inactive) {
            handle.stop();
          }
        });
      });
    }

    return handle;
  }

  /**
   * @summary Tells if the method call came from a call or a callAsync.
   * @alias Meteor.isAsyncCall
   * @locus Anywhere
   * @memberOf Meteor
   * @importFromPackage meteor
   * @returns boolean
   */
  isAsyncCall(){
    return DDP._CurrentMethodInvocation._isCallAsyncMethodRunning()
  }
  methods(methods) {
    Object.entries(methods).forEach(([name, func]) => {
      if (typeof func !== 'function') {
        throw new Error("Method '" + name + "' must be a function");
      }
      if (this._methodHandlers[name]) {
        throw new Error("A method named '" + name + "' is already defined");
      }
      this._methodHandlers[name] = func;
    });
  }

  _getIsSimulation({isFromCallAsync, alreadyInSimulation}) {
    if (!isFromCallAsync) {
      return alreadyInSimulation;
    }
    return alreadyInSimulation && DDP._CurrentMethodInvocation._isCallAsyncMethodRunning();
  }

  /**
   * @memberOf Meteor
   * @importFromPackage meteor
   * @alias Meteor.call
   * @summary Invokes a method with a sync stub, passing any number of arguments.
   * @locus Anywhere
   * @param {String} name Name of method to invoke
   * @param {EJSONable} [arg1,arg2...] Optional method arguments
   * @param {Function} [asyncCallback] Optional callback, which is called asynchronously with the error or result after the method is complete. If not provided, the method runs synchronously if possible (see below).
   */
  call(name /* .. [arguments] .. callback */) {
    // if it's a function, the last argument is the result callback,
    // not a parameter to the remote method.
    const args = slice.call(arguments, 1);
    let callback;
    if (args.length && typeof args[args.length - 1] === 'function') {
      callback = args.pop();
    }
    return this.apply(name, args, callback);
  }
  /**
   * @memberOf Meteor
   * @importFromPackage meteor
   * @alias Meteor.callAsync
   * @summary Invokes a method with an async stub, passing any number of arguments.
   * @locus Anywhere
   * @param {String} name Name of method to invoke
   * @param {EJSONable} [arg1,arg2...] Optional method arguments
   * @returns {Promise}
   */
  callAsync(name /* .. [arguments] .. */) {
    const args = slice.call(arguments, 1);
    if (args.length && typeof args[args.length - 1] === 'function') {
      throw new Error(
        "Meteor.callAsync() does not accept a callback. You should 'await' the result, or use .then()."
      );
    }

    return this.applyAsync(name, args, { returnServerResultPromise: true });
  }

  /**
   * @memberOf Meteor
   * @importFromPackage meteor
   * @alias Meteor.apply
   * @summary Invoke a method passing an array of arguments.
   * @locus Anywhere
   * @param {String} name Name of method to invoke
   * @param {EJSONable[]} args Method arguments
   * @param {Object} [options]
   * @param {Boolean} options.wait (Client only) If true, don't send this method until all previous method calls have completed, and don't send any subsequent method calls until this one is completed.
   * @param {Function} options.onResultReceived (Client only) This callback is invoked with the error or result of the method (just like `asyncCallback`) as soon as the error or result is available. The local cache may not yet reflect the writes performed by the method.
   * @param {Boolean} options.noRetry (Client only) if true, don't send this method again on reload, simply call the callback an error with the error code 'invocation-failed'.
   * @param {Boolean} options.throwStubExceptions (Client only) If true, exceptions thrown by method stubs will be thrown instead of logged, and the method will not be invoked on the server.
   * @param {Boolean} options.returnStubValue (Client only) If true then in cases where we would have otherwise discarded the stub's return value and returned undefined, instead we go ahead and return it. Specifically, this is any time other than when (a) we are already inside a stub or (b) we are in Node and no callback was provided. Currently we require this flag to be explicitly passed to reduce the likelihood that stub return values will be confused with server return values; we may improve this in future.
   * @param {Function} [asyncCallback] Optional callback; same semantics as in [`Meteor.call`](#meteor_call).
   */
  apply(name, args, options, callback) {
    const { stubInvocation, invocation, ...stubOptions } = this._stubCall(name, EJSON.clone(args));

    if (stubOptions.hasStub) {
      if (
        !this._getIsSimulation({
          alreadyInSimulation: stubOptions.alreadyInSimulation,
          isFromCallAsync: stubOptions.isFromCallAsync,
        })
      ) {
        this._saveOriginals();
      }
      try {
        stubOptions.stubReturnValue = DDP._CurrentMethodInvocation
          .withValue(invocation, stubInvocation);
        if (Meteor._isPromise(stubOptions.stubReturnValue)) {
          Meteor._debug(
            `Method ${name}: Calling a method that has an async method stub with call/apply can lead to unexpected behaviors. Use callAsync/applyAsync instead.`
          );
        }
      } catch (e) {
        stubOptions.exception = e;
      }
    }
    return this._apply(name, stubOptions, args, options, callback);
  }

  /**
   * @memberOf Meteor
   * @importFromPackage meteor
   * @alias Meteor.applyAsync
   * @summary Invoke a method passing an array of arguments.
   * @locus Anywhere
   * @param {String} name Name of method to invoke
   * @param {EJSONable[]} args Method arguments
   * @param {Object} [options]
   * @param {Boolean} options.wait (Client only) If true, don't send this method until all previous method calls have completed, and don't send any subsequent method calls until this one is completed.
   * @param {Function} options.onResultReceived (Client only) This callback is invoked with the error or result of the method (just like `asyncCallback`) as soon as the error or result is available. The local cache may not yet reflect the writes performed by the method.
   * @param {Boolean} options.noRetry (Client only) if true, don't send this method again on reload, simply call the callback an error with the error code 'invocation-failed'.
   * @param {Boolean} options.throwStubExceptions (Client only) If true, exceptions thrown by method stubs will be thrown instead of logged, and the method will not be invoked on the server.
   * @param {Boolean} options.returnStubValue (Client only) If true then in cases where we would have otherwise discarded the stub's return value and returned undefined, instead we go ahead and return it. Specifically, this is any time other than when (a) we are already inside a stub or (b) we are in Node and no callback was provided. Currently we require this flag to be explicitly passed to reduce the likelihood that stub return values will be confused with server return values; we may improve this in future.
   * @param {Boolean} options.returnServerResultPromise (Client only) If true, the promise returned by applyAsync will resolve to the server's return value, rather than the stub's return value. This is useful when you want to ensure that the server's return value is used, even if the stub returns a promise. The same behavior as `callAsync`.
   */
  applyAsync(name, args, options, callback = null) {
    const stubPromise = this._applyAsyncStubInvocation(name, args, options);

    const promise = this._applyAsync({
      name,
      args,
      options,
      callback,
      stubPromise,
    });
    if (Meteor.isClient) {
      // only return the stubReturnValue
      promise.stubPromise = stubPromise.then(o => {
        if (o.exception) {
          throw o.exception;
        }
        return o.stubReturnValue;
      });
      // this avoids attribute recursion
      promise.serverPromise = new Promise((resolve, reject) =>
        promise.then(resolve).catch(reject),
      );
    }
    return promise;
  }
  async _applyAsyncStubInvocation(name, args, options) {
    const { stubInvocation, invocation, ...stubOptions } = this._stubCall(name, EJSON.clone(args), options);
    if (stubOptions.hasStub) {
      if (
        !this._getIsSimulation({
          alreadyInSimulation: stubOptions.alreadyInSimulation,
          isFromCallAsync: stubOptions.isFromCallAsync,
        })
      ) {
        this._saveOriginals();
      }
      try {
        /*
         * The code below follows the same logic as the function withValues().
         *
         * But as the Meteor package is not compiled by ecmascript, it is unable to use newer syntax in the browser,
         * such as, the async/await.
         *
         * So, to keep supporting old browsers, like IE 11, we're creating the logic one level above.
         */
        const currentContext = DDP._CurrentMethodInvocation._setNewContextAndGetCurrent(
          invocation
        );
        try {
          stubOptions.stubReturnValue = await stubInvocation();
        } catch (e) {
          stubOptions.exception = e;
        } finally {
          DDP._CurrentMethodInvocation._set(currentContext);
        }
      } catch (e) {
        stubOptions.exception = e;
      }
    }
    return stubOptions;
  }
  async _applyAsync({ name, args, options, callback, stubPromise }) {
    const stubOptions = await stubPromise;
    return this._apply(name, stubOptions, args, options, callback);
  }

  _apply(name, stubCallValue, args, options, callback) {
    const self = this;

    // We were passed 3 arguments. They may be either (name, args, options)
    // or (name, args, callback)
    if (!callback && typeof options === 'function') {
      callback = options;
      options = Object.create(null);
    }
    options = options || Object.create(null);

    if (callback) {
      // XXX would it be better form to do the binding in stream.on,
      // or caller, instead of here?
      // XXX improve error message (and how we report it)
      callback = Meteor.bindEnvironment(
        callback,
        "delivering result of invoking '" + name + "'"
      );
    }
    const {
      hasStub,
      exception,
      stubReturnValue,
      alreadyInSimulation,
      randomSeed,
    } = stubCallValue;

    // Keep our args safe from mutation (eg if we don't send the message for a
    // while because of a wait method).
    args = EJSON.clone(args);
    // If we're in a simulation, stop and return the result we have,
    // rather than going on to do an RPC. If there was no stub,
    // we'll end up returning undefined.
    if (
      this._getIsSimulation({
        alreadyInSimulation,
        isFromCallAsync: stubCallValue.isFromCallAsync,
      })
    ) {
      let result;

      if (callback) {
        callback(exception, stubReturnValue);
      } else {
        if (exception) throw exception;
        result = stubReturnValue;
      }

      return options._returnMethodInvoker ? { result } : result;
    }

    // We only create the methodId here because we don't actually need one if
    // we're already in a simulation
    const methodId = '' + self._nextMethodId++;
    if (hasStub) {
      self._retrieveAndStoreOriginals(methodId);
    }

    // Generate the DDP message for the method call. Note that on the client,
    // it is important that the stub have finished before we send the RPC, so
    // that we know we have a complete list of which local documents the stub
    // wrote.
    const message = {
      msg: 'method',
      id: methodId,
      method: name,
      params: args
    };

    // If an exception occurred in a stub, and we're ignoring it
    // because we're doing an RPC and want to use what the server
    // returns instead, log it so the developer knows
    // (unless they explicitly ask to see the error).
    //
    // Tests can set the '_expectedByTest' flag on an exception so it won't
    // go to log.
    if (exception) {
      if (options.throwStubExceptions) {
        throw exception;
      } else if (!exception._expectedByTest) {
        Meteor._debug(
          "Exception while simulating the effect of invoking '" + name + "'",
          exception
        );
      }
    }

    // At this point we're definitely doing an RPC, and we're going to
    // return the value of the RPC to the caller.

    // If the caller didn't give a callback, decide what to do.
    let promise;
    if (!callback) {
      if (
        Meteor.isClient &&
        !options.returnServerResultPromise &&
        (!options.isFromCallAsync || options.returnStubValue)
      ) {
        callback = (err) => {
          err && Meteor._debug("Error invoking Method '" + name + "'", err);
        };
      } else {
        promise = new Promise((resolve, reject) => {
          callback = (...allArgs) => {
            let args = Array.from(allArgs);
            let err = args.shift();
            if (err) {
              reject(err);
              return;
            }
            resolve(...args);
          };
        });
      }
    }

    // Send the randomSeed only if we used it
    if (randomSeed.value !== null) {
      message.randomSeed = randomSeed.value;
    }

    const methodInvoker = new MethodInvoker({
      methodId,
      callback: callback,
      connection: self,
      onResultReceived: options.onResultReceived,
      wait: !!options.wait,
      message: message,
      noRetry: !!options.noRetry
    });

    let result;

    if (promise) {
      result = options.returnStubValue ? promise.then(() => stubReturnValue) : promise;
    } else {
      result = options.returnStubValue ? stubReturnValue : undefined;
    }

    if (options._returnMethodInvoker) {
      return {
        methodInvoker,
        result,
      };
    }

    self._addOutstandingMethod(methodInvoker, options);
    return result;
  }

  _stubCall(name, args, options) {
    // Run the stub, if we have one. The stub is supposed to make some
    // temporary writes to the database to give the user a smooth experience
    // until the actual result of executing the method comes back from the
    // server (whereupon the temporary writes to the database will be reversed
    // during the beginUpdate/endUpdate process.)
    //
    // Normally, we ignore the return value of the stub (even if it is an
    // exception), in favor of the real return value from the server. The
    // exception is if the *caller* is a stub. In that case, we're not going
    // to do a RPC, so we use the return value of the stub as our return
    // value.
    const self = this;
    const enclosing = DDP._CurrentMethodInvocation.get();
    const stub = self._methodHandlers[name];
    const alreadyInSimulation = enclosing?.isSimulation;
    const isFromCallAsync = enclosing?._isFromCallAsync;
    const randomSeed = { value: null};

    const defaultReturn = {
      alreadyInSimulation,
      randomSeed,
      isFromCallAsync,
    };
    if (!stub) {
      return { ...defaultReturn, hasStub: false };
    }

    // Lazily generate a randomSeed, only if it is requested by the stub.
    // The random streams only have utility if they're used on both the client
    // and the server; if the client doesn't generate any 'random' values
    // then we don't expect the server to generate any either.
    // Less commonly, the server may perform different actions from the client,
    // and may in fact generate values where the client did not, but we don't
    // have any client-side values to match, so even here we may as well just
    // use a random seed on the server.  In that case, we don't pass the
    // randomSeed to save bandwidth, and we don't even generate it to save a
    // bit of CPU and to avoid consuming entropy.

    const randomSeedGenerator = () => {
      if (randomSeed.value === null) {
        randomSeed.value = DDPCommon.makeRpcSeed(enclosing, name);
      }
      return randomSeed.value;
    };

    const setUserId = userId => {
      self.setUserId(userId);
    };

    const invocation = new DDPCommon.MethodInvocation({
      name,
      isSimulation: true,
      userId: self.userId(),
      isFromCallAsync: options?.isFromCallAsync,
      setUserId: setUserId,
      randomSeed() {
        return randomSeedGenerator();
      }
    });

    // Note that unlike in the corresponding server code, we never audit
    // that stubs check() their arguments.
    const stubInvocation = () => {
        if (Meteor.isServer) {
          // Because saveOriginals and retrieveOriginals aren't reentrant,
          // don't allow stubs to yield.
          return Meteor._noYieldsAllowed(() => {
            // re-clone, so that the stub can't affect our caller's values
            return stub.apply(invocation, EJSON.clone(args));
          });
        } else {
          return stub.apply(invocation, EJSON.clone(args));
        }
    };
    return { ...defaultReturn, hasStub: true, stubInvocation, invocation };
  }

  // Before calling a method stub, prepare all stores to track changes and allow
  // _retrieveAndStoreOriginals to get the original versions of changed
  // documents.
  _saveOriginals() {
    if (! this._waitingForQuiescence()) {
      this._flushBufferedWrites();
    }

    Object.values(this._stores).forEach((store) => {
      store.saveOriginals();
    });
  }

  // Retrieves the original versions of all documents modified by the stub for
  // method 'methodId' from all stores and saves them to _serverDocuments (keyed
  // by document) and _documentsWrittenByStub (keyed by method ID).
  _retrieveAndStoreOriginals(methodId) {
    const self = this;
    if (self._documentsWrittenByStub[methodId])
      throw new Error('Duplicate methodId in _retrieveAndStoreOriginals');

    const docsWritten = [];

    Object.entries(self._stores).forEach(([collection, store]) => {
      const originals = store.retrieveOriginals();
      // not all stores define retrieveOriginals
      if (! originals) return;
      originals.forEach((doc, id) => {
        docsWritten.push({ collection, id });
        if (! hasOwn.call(self._serverDocuments, collection)) {
          self._serverDocuments[collection] = new MongoIDMap();
        }
        const serverDoc = self._serverDocuments[collection].setDefault(
          id,
          Object.create(null)
        );
        if (serverDoc.writtenByStubs) {
          // We're not the first stub to write this doc. Just add our method ID
          // to the record.
          serverDoc.writtenByStubs[methodId] = true;
        } else {
          // First stub! Save the original value and our method ID.
          serverDoc.document = doc;
          serverDoc.flushCallbacks = [];
          serverDoc.writtenByStubs = Object.create(null);
          serverDoc.writtenByStubs[methodId] = true;
        }
      });
    });
    if (! isEmpty(docsWritten)) {
      self._documentsWrittenByStub[methodId] = docsWritten;
    }
  }

  // This is very much a private function we use to make the tests
  // take up fewer server resources after they complete.
  _unsubscribeAll() {
    Object.values(this._subscriptions).forEach((sub) => {
      // Avoid killing the autoupdate subscription so that developers
      // still get hot code pushes when writing tests.
      //
      // XXX it's a hack to encode knowledge about autoupdate here,
      // but it doesn't seem worth it yet to have a special API for
      // subscriptions to preserve after unit tests.
      if (sub.name !== 'meteor_autoupdate_clientVersions') {
        sub.stop();
      }
    });
  }

  // Sends the DDP stringification of the given message object
  _send(obj) {
    this._stream.send(DDPCommon.stringifyDDP(obj));
  }

  // Always queues the call before sending the message
  // Used, for example, on subscription.[id].stop() to make sure a "sub" message is always called before an "unsub" message
  // https://github.com/meteor/meteor/issues/13212
  //
  // This is part of the actual fix for the rest check:
  // https://github.com/meteor/meteor/pull/13236
  _sendQueued(obj) {
    this._send(obj, true);
  }

  // We detected via DDP-level heartbeats that we've lost the
  // connection.  Unlike `disconnect` or `close`, a lost connection
  // will be automatically retried.
  _lostConnection(error) {
    this._stream._lostConnection(error);
  }

  /**
   * @memberOf Meteor
   * @importFromPackage meteor
   * @alias Meteor.status
   * @summary Get the current connection status. A reactive data source.
   * @locus Client
   */
  status(...args) {
    return this._stream.status(...args);
  }

  /**
   * @summary Force an immediate reconnection attempt if the client is not connected to the server.

  This method does nothing if the client is already connected.
   * @memberOf Meteor
   * @importFromPackage meteor
   * @alias Meteor.reconnect
   * @locus Client
   */
  reconnect(...args) {
    return this._stream.reconnect(...args);
  }

  /**
   * @memberOf Meteor
   * @importFromPackage meteor
   * @alias Meteor.disconnect
   * @summary Disconnect the client from the server.
   * @locus Client
   */
  disconnect(...args) {
    return this._stream.disconnect(...args);
  }

  close() {
    return this._stream.disconnect({ _permanent: true });
  }

  ///
  /// Reactive user system
  ///
  userId() {
    if (this._userIdDeps) this._userIdDeps.depend();
    return this._userId;
  }

  setUserId(userId) {
    // Avoid invalidating dependents if setUserId is called with current value.
    if (this._userId === userId) return;
    this._userId = userId;
    if (this._userIdDeps) this._userIdDeps.changed();
  }

  // Returns true if we are in a state after reconnect of waiting for subs to be
  // revived or early methods to finish their data, or we are waiting for a
  // "wait" method to finish.
  _waitingForQuiescence() {
    return (
      ! isEmpty(this._subsBeingRevived) ||
      ! isEmpty(this._methodsBlockingQuiescence)
    );
  }

  // Returns true if any method whose message has been sent to the server has
  // not yet invoked its user callback.
  _anyMethodsAreOutstanding() {
    const invokers = this._methodInvokers;
    return Object.values(invokers).some((invoker) => !!invoker.sentMessage);
  }

  async _processOneDataMessage(msg, updates) {
    const messageType = msg.msg;

    // msg is one of ['added', 'changed', 'removed', 'ready', 'updated']
    if (messageType === 'added') {
      await this._process_added(msg, updates);
    } else if (messageType === 'changed') {
      this._process_changed(msg, updates);
    } else if (messageType === 'removed') {
      this._process_removed(msg, updates);
    } else if (messageType === 'ready') {
      this._process_ready(msg, updates);
    } else if (messageType === 'updated') {
      this._process_updated(msg, updates);
    } else if (messageType === 'nosub') {
      // ignore this
    } else {
      Meteor._debug('discarding unknown livedata data message type', msg);
    }
  }

  _prepareBuffersToFlush() {
    const self = this;
    if (self._bufferedWritesFlushHandle) {
      clearTimeout(self._bufferedWritesFlushHandle);
      self._bufferedWritesFlushHandle = null;
    }

    self._bufferedWritesFlushAt = null;
    // We need to clear the buffer before passing it to
    //  performWrites. As there's no guarantee that it
    //  will exit cleanly.
    const writes = self._bufferedWrites;
    self._bufferedWrites = Object.create(null);
    return writes;
  }

  /**
   * Server-side store updates handled asynchronously
   * @private
   */
  async _performWritesServer(updates) {
    const self = this;

    if (self._resetStores || !isEmpty(updates)) {
      // Start all store updates - keeping original loop structure
      for (const store of Object.values(self._stores)) {
        await store.beginUpdate(
          updates[store._name]?.length || 0,
          self._resetStores
        );
      }

      self._resetStores = false;

      // Process each store's updates sequentially as before
      for (const [storeName, messages] of Object.entries(updates)) {
        const store = self._stores[storeName];
        if (store) {
          // Batch each store's messages in modest chunks to prevent event loop blocking
          // while maintaining operation order
          const CHUNK_SIZE = 100;
          for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, Math.min(i + CHUNK_SIZE, messages.length));

            for (const msg of chunk) {
              await store.update(msg);
            }

            await new Promise(resolve => process.nextTick(resolve));
          }
        } else {
          // Queue updates for uninitialized stores
          self._updatesForUnknownStores[storeName] =
            self._updatesForUnknownStores[storeName] || [];
          self._updatesForUnknownStores[storeName].push(...messages);
        }
      }

      // Complete all updates
      for (const store of Object.values(self._stores)) {
        await store.endUpdate();
      }
    }

    self._runAfterUpdateCallbacks();
  }

  /**
   * Client-side store updates handled synchronously for optimistic UI
   * @private
   */
  _performWritesClient(updates) {
    const self = this;

    if (self._resetStores || !isEmpty(updates)) {
      // Synchronous store updates for client
      Object.values(self._stores).forEach(store => {
        store.beginUpdate(
          updates[store._name]?.length || 0,
          self._resetStores
        );
      });

      self._resetStores = false;

      Object.entries(updates).forEach(([storeName, messages]) => {
        const store = self._stores[storeName];
        if (store) {
          messages.forEach(msg => store.update(msg));
        } else {
          self._updatesForUnknownStores[storeName] =
            self._updatesForUnknownStores[storeName] || [];
          self._updatesForUnknownStores[storeName].push(...messages);
        }
      });

      Object.values(self._stores).forEach(store => store.endUpdate());
    }

    self._runAfterUpdateCallbacks();
  }

  /**
   * Executes buffered writes either synchronously (client) or async (server)
   * @private
   */
  async _flushBufferedWrites() {
    const self = this;
    const writes = self._prepareBuffersToFlush();

    return Meteor.isClient
      ? self._performWritesClient(writes)
      : self._performWritesServer(writes);
  }

  // Call any callbacks deferred with _runWhenAllServerDocsAreFlushed whose
  // relevant docs have been flushed, as well as dataVisible callbacks at
  // reconnect-quiescence time.
  _runAfterUpdateCallbacks() {
    const self = this;
    const callbacks = self._afterUpdateCallbacks;
    self._afterUpdateCallbacks = [];
    callbacks.forEach((c) => {
      c();
    });
  }

  // Ensures that "f" will be called after all documents currently in
  // _serverDocuments have been written to the local cache. f will not be called
  // if the connection is lost before then!
  _runWhenAllServerDocsAreFlushed(f) {
    const self = this;
    const runFAfterUpdates = () => {
      self._afterUpdateCallbacks.push(f);
    };
    let unflushedServerDocCount = 0;
    const onServerDocFlush = () => {
      --unflushedServerDocCount;
      if (unflushedServerDocCount === 0) {
        // This was the last doc to flush! Arrange to run f after the updates
        // have been applied.
        runFAfterUpdates();
      }
    };

    Object.values(self._serverDocuments).forEach((serverDocuments) => {
      serverDocuments.forEach((serverDoc) => {
        const writtenByStubForAMethodWithSentMessage =
          keys(serverDoc.writtenByStubs).some(methodId => {
            const invoker = self._methodInvokers[methodId];
            return invoker && invoker.sentMessage;
          });

        if (writtenByStubForAMethodWithSentMessage) {
          ++unflushedServerDocCount;
          serverDoc.flushCallbacks.push(onServerDocFlush);
        }
      });
    });
    if (unflushedServerDocCount === 0) {
      // There aren't any buffered docs --- we can call f as soon as the current
      // round of updates is applied!
      runFAfterUpdates();
    }
  }

  _addOutstandingMethod(methodInvoker, options) {
    if (options?.wait) {
      // It's a wait method! Wait methods go in their own block.
      this._outstandingMethodBlocks.push({
        wait: true,
        methods: [methodInvoker]
      });
    } else {
      // Not a wait method. Start a new block if the previous block was a wait
      // block, and add it to the last block of methods.
      if (isEmpty(this._outstandingMethodBlocks) ||
          last(this._outstandingMethodBlocks).wait) {
        this._outstandingMethodBlocks.push({
          wait: false,
          methods: [],
        });
      }

      last(this._outstandingMethodBlocks).methods.push(methodInvoker);
    }

    // If we added it to the first block, send it out now.
    if (this._outstandingMethodBlocks.length === 1) {
      methodInvoker.sendMessage();
    }
  }

  // Called by MethodInvoker after a method's callback is invoked.  If this was
  // the last outstanding method in the current block, runs the next block. If
  // there are no more methods, consider accepting a hot code push.
  _outstandingMethodFinished() {
    const self = this;
    if (self._anyMethodsAreOutstanding()) return;

    // No methods are outstanding. This should mean that the first block of
    // methods is empty. (Or it might not exist, if this was a method that
    // half-finished before disconnect/reconnect.)
    if (! isEmpty(self._outstandingMethodBlocks)) {
      const firstBlock = self._outstandingMethodBlocks.shift();
      if (! isEmpty(firstBlock.methods))
        throw new Error(
          'No methods outstanding but nonempty block: ' +
            JSON.stringify(firstBlock)
        );

      // Send the outstanding methods now in the first block.
      if (! isEmpty(self._outstandingMethodBlocks))
        self._sendOutstandingMethods();
    }

    // Maybe accept a hot code push.
    self._maybeMigrate();
  }

  // Sends messages for all the methods in the first block in
  // _outstandingMethodBlocks.
  _sendOutstandingMethods() {
    const self = this;

    if (isEmpty(self._outstandingMethodBlocks)) {
      return;
    }

    self._outstandingMethodBlocks[0].methods.forEach(m => {
      m.sendMessage();
    });
  }

  _sendOutstandingMethodBlocksMessages(oldOutstandingMethodBlocks) {
    const self = this;
    if (isEmpty(oldOutstandingMethodBlocks)) return;

    // We have at least one block worth of old outstanding methods to try
    // again. First: did onReconnect actually send anything? If not, we just
    // restore all outstanding methods and run the first block.
    if (isEmpty(self._outstandingMethodBlocks)) {
      self._outstandingMethodBlocks = oldOutstandingMethodBlocks;
      self._sendOutstandingMethods();
      return;
    }

    // OK, there are blocks on both sides. Special case: merge the last block of
    // the reconnect methods with the first block of the original methods, if
    // neither of them are "wait" blocks.
    if (
      !last(self._outstandingMethodBlocks).wait &&
      !oldOutstandingMethodBlocks[0].wait
    ) {
      oldOutstandingMethodBlocks[0].methods.forEach((m) => {
        last(self._outstandingMethodBlocks).methods.push(m);

        // If this "last block" is also the first block, send the message.
        if (self._outstandingMethodBlocks.length === 1) {
          m.sendMessage();
        }
      });

      oldOutstandingMethodBlocks.shift();
    }

    // Now add the rest of the original blocks on.
    self._outstandingMethodBlocks.push(...oldOutstandingMethodBlocks);
  }

  _callOnReconnectAndSendAppropriateOutstandingMethods() {
    const self = this;
    const oldOutstandingMethodBlocks = self._outstandingMethodBlocks;
    self._outstandingMethodBlocks = [];

    self.onReconnect && self.onReconnect();
    DDP._reconnectHook.each((callback) => {
      callback(self);
      return true;
    });

    self._sendOutstandingMethodBlocksMessages(oldOutstandingMethodBlocks);
  }

  // We can accept a hot code push if there are no methods in flight.
  _readyToMigrate() {
    return isEmpty(this._methodInvokers);
  }

  // If we were blocking a migration, see if it's now possible to continue.
  // Call whenever the set of outstanding/blocked methods shrinks.
  _maybeMigrate() {
    const self = this;
    if (self._retryMigrate && self._readyToMigrate()) {
      self._retryMigrate();
      self._retryMigrate = null;
    }
  }
}
