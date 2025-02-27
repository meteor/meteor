import { DDPCommon } from 'meteor/ddp-common';
import { Meteor } from 'meteor/meteor';
import { DDP } from './namespace.js';
import { EJSON } from 'meteor/ejson';
import { isEmpty, hasOwn } from "meteor/ddp-common/utils";

export class MessageProcessors {
  constructor(connection) {
    this._connection = connection;
  }

  /**
   * @summary Process the connection message and set up the session
   * @param {Object} msg The connection message
   */
  async _livedata_connected(msg) {
    const self = this._connection;

    if (self._version !== 'pre1' && self._heartbeatInterval !== 0) {
      self._heartbeat = new DDPCommon.Heartbeat({
        heartbeatInterval: self._heartbeatInterval,
        heartbeatTimeout: self._heartbeatTimeout,
        onTimeout() {
          self._lostConnection(
            new DDP.ConnectionError('DDP heartbeat timed out')
          );
        },
        sendPing() {
          self._send({ msg: 'ping' });
        }
      });
      self._heartbeat.start();
    }

    // If this is a reconnect, we'll have to reset all stores.
    if (self._lastSessionId) self._resetStores = true;

    let reconnectedToPreviousSession;
    if (typeof msg.session === 'string') {
      reconnectedToPreviousSession = self._lastSessionId === msg.session;
      self._lastSessionId = msg.session;
    }

    if (reconnectedToPreviousSession) {
      // Successful reconnection -- pick up where we left off.
      return;
    }

    // Server doesn't have our data anymore. Re-sync a new session.

    // Forget about messages we were buffering for unknown collections. They'll
    // be resent if still relevant.
    self._updatesForUnknownStores = Object.create(null);

    if (self._resetStores) {
      // Forget about the effects of stubs. We'll be resetting all collections
      // anyway.
      self._documentsWrittenByStub = Object.create(null);
      self._serverDocuments = Object.create(null);
    }

    // Clear _afterUpdateCallbacks.
    self._afterUpdateCallbacks = [];

    // Mark all named subscriptions which are ready as needing to be revived.
    self._subsBeingRevived = Object.create(null);
    Object.entries(self._subscriptions).forEach(([id, sub]) => {
      if (sub.ready) {
        self._subsBeingRevived[id] = true;
      }
    });

    // Arrange for "half-finished" methods to have their callbacks run, and
    // track methods that were sent on this connection so that we don't
    // quiesce until they are all done.
    //
    // Start by clearing _methodsBlockingQuiescence: methods sent before
    // reconnect don't matter, and any "wait" methods sent on the new connection
    // that we drop here will be restored by the loop below.
    self._methodsBlockingQuiescence = Object.create(null);
    if (self._resetStores) {
      const invokers = self._methodInvokers;
      Object.keys(invokers).forEach(id => {
        const invoker = invokers[id];
        if (invoker.gotResult()) {
          // This method already got its result, but it didn't call its callback
          // because its data didn't become visible. We did not resend the
          // method RPC. We'll call its callback when we get a full quiesce,
          // since that's as close as we'll get to "data must be visible".
          self._afterUpdateCallbacks.push(
            (...args) => invoker.dataVisible(...args)
          );
        } else if (invoker.sentMessage) {
          // This method has been sent on this connection (maybe as a resend
          // from the last connection, maybe from onReconnect, maybe just very
          // quickly before processing the connected message).
          //
          // We don't need to do anything special to ensure its callbacks get
          // called, but we'll count it as a method which is preventing
          // reconnect quiescence. (eg, it might be a login method that was run
          // from onReconnect, and we don't want to see flicker by seeing a
          // logged-out state.)
          self._methodsBlockingQuiescence[invoker.methodId] = true;
        }
      });
    }

    self._messagesBufferedUntilQuiescence = [];

    // If we're not waiting on any methods or subs, we can reset the stores and
    // call the callbacks immediately.
    if (!self._waitingForQuiescence()) {
      if (self._resetStores) {
        for (const store of Object.values(self._stores)) {
          await store.beginUpdate(0, true);
          await store.endUpdate();
        }
        self._resetStores = false;
      }
      self._runAfterUpdateCallbacks();
    }
  }

  /**
   * @summary Process various data messages from the server
   * @param {Object} msg The data message
   */
  async _livedata_data(msg) {
    const self = this._connection;

    if (self._waitingForQuiescence()) {
      self._messagesBufferedUntilQuiescence.push(msg);

      if (msg.msg === 'nosub') {
        delete self._subsBeingRevived[msg.id];
      }

      if (msg.subs) {
        msg.subs.forEach(subId => {
          delete self._subsBeingRevived[subId];
        });
      }

      if (msg.methods) {
        msg.methods.forEach(methodId => {
          delete self._methodsBlockingQuiescence[methodId];
        });
      }

      if (self._waitingForQuiescence()) {
        return;
      }

      // No methods or subs are blocking quiescence!
      // We'll now process and all of our buffered messages, reset all stores,
      // and apply them all at once.
      const bufferedMessages = self._messagesBufferedUntilQuiescence;
      for (const bufferedMessage of Object.values(bufferedMessages)) {
        await this._processOneDataMessage(
          bufferedMessage,
          self._bufferedWrites
        );
      }
      self._messagesBufferedUntilQuiescence = [];
    } else {
      await this._processOneDataMessage(msg, self._bufferedWrites);
    }

    // Immediately flush writes when:
    //  1. Buffering is disabled. Or;
    //  2. any non-(added/changed/removed) message arrives.
    const standardWrite =
      msg.msg === "added" ||
      msg.msg === "changed" ||
      msg.msg === "removed";

    if (self._bufferedWritesInterval === 0 || !standardWrite) {
      await self._flushBufferedWrites();
      return;
    }

    if (self._bufferedWritesFlushAt === null) {
      self._bufferedWritesFlushAt =
        new Date().valueOf() + self._bufferedWritesMaxAge;
    } else if (self._bufferedWritesFlushAt < new Date().valueOf()) {
      await self._flushBufferedWrites();
      return;
    }

    if (self._bufferedWritesFlushHandle) {
      clearTimeout(self._bufferedWritesFlushHandle);
    }
    self._bufferedWritesFlushHandle = setTimeout(() => {
      self._liveDataWritesPromise = self._flushBufferedWrites();
      if (Meteor._isPromise(self._liveDataWritesPromise)) {
        self._liveDataWritesPromise.finally(
          () => (self._liveDataWritesPromise = undefined)
        );
      }
    }, self._bufferedWritesInterval);
  }

  /**
   * @summary Process individual data messages by type
   * @private
   */
  async _processOneDataMessage(msg, updates) {
    const messageType = msg.msg;

    switch (messageType) {
      case 'added':
        await this._connection._process_added(msg, updates);
        break;
      case 'changed':
        this._connection._process_changed(msg, updates);
        break;
      case 'removed':
        this._connection._process_removed(msg, updates);
        break;
      case 'ready':
        this._connection._process_ready(msg, updates);
        break;
      case 'updated':
        this._connection._process_updated(msg, updates);
        break;
      case 'nosub':
        // ignore this
        break;
      default:
        Meteor._debug('discarding unknown livedata data message type', msg);
    }
  }

  /**
   * @summary Handle method results arriving from the server
   * @param {Object} msg The method result message
   */
  async _livedata_result(msg) {
    const self = this._connection;

    // Lets make sure there are no buffered writes before returning result.
    if (!isEmpty(self._bufferedWrites)) {
      await self._flushBufferedWrites();
    }

    // find the outstanding request
    // should be O(1) in nearly all realistic use cases
    if (isEmpty(self._outstandingMethodBlocks)) {
      Meteor._debug('Received method result but no methods outstanding');
      return;
    }
    const currentMethodBlock = self._outstandingMethodBlocks[0].methods;
    let i;
    const m = currentMethodBlock.find((method, idx) => {
      const found = method.methodId === msg.id;
      if (found) i = idx;
      return found;
    });
    if (!m) {
      Meteor._debug("Can't match method response to original method call", msg);
      return;
    }

    // Remove from current method block. This may leave the block empty, but we
    // don't move on to the next block until the callback has been delivered, in
    // _outstandingMethodFinished.
    currentMethodBlock.splice(i, 1);

    if (hasOwn.call(msg, 'error')) {
      m.receiveResult(
        new Meteor.Error(msg.error.error, msg.error.reason, msg.error.details)
      );
    } else {
      // msg.result may be undefined if the method didn't return a value
      m.receiveResult(undefined, msg.result);
    }
  }

  /**
   * @summary Handle "nosub" messages arriving from the server
   * @param {Object} msg The nosub message
   */
  async _livedata_nosub(msg) {
    const self = this._connection;

    // First pass it through _livedata_data, which only uses it to help get
    // towards quiescence.
    await this._livedata_data(msg);

    // Do the rest of our processing immediately, with no
    // buffering-until-quiescence.

    // we weren't subbed anyway, or we initiated the unsub.
    if (!hasOwn.call(self._subscriptions, msg.id)) {
      return;
    }

    // XXX COMPAT WITH 1.0.3.1 #errorCallback
    const errorCallback = self._subscriptions[msg.id].errorCallback;
    const stopCallback = self._subscriptions[msg.id].stopCallback;

    self._subscriptions[msg.id].remove();

    const meteorErrorFromMsg = msgArg => {
      return (
        msgArg &&
        msgArg.error &&
        new Meteor.Error(
          msgArg.error.error,
          msgArg.error.reason,
          msgArg.error.details
        )
      );
    };

    // XXX COMPAT WITH 1.0.3.1 #errorCallback
    if (errorCallback && msg.error) {
      errorCallback(meteorErrorFromMsg(msg));
    }

    if (stopCallback) {
      stopCallback(meteorErrorFromMsg(msg));
    }
  }

  /**
   * @summary Handle errors from the server
   * @param {Object} msg The error message
   */
  _livedata_error(msg) {
    Meteor._debug('Received error from server: ', msg.reason);
    if (msg.offendingMessage) Meteor._debug('For: ', msg.offendingMessage);
  }

  // Document change message processors will be defined in a separate class
}