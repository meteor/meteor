import { DDPCommon } from 'meteor/ddp-common';
import { Meteor } from 'meteor/meteor';

export class ConnectionStreamHandlers {
  constructor(connection) {
    this._connection = connection;
  }

  /**
   * Handles incoming raw messages from the DDP stream
   * @param {String} raw_msg The raw message received from the stream
   */
  async onMessage(raw_msg) {
    let msg;
    try {
      msg = DDPCommon.parseDDP(raw_msg);
    } catch (e) {
      Meteor._debug('Exception while parsing DDP', e);
      return;
    }

    // Any message counts as receiving a pong, as it demonstrates that
    // the server is still alive.
    if (this._connection._heartbeat) {
      this._connection._heartbeat.messageReceived();
    }

    if (msg === null || !msg.msg) {
      if(!msg || !msg.testMessageOnConnect) {
        if (Object.keys(msg).length === 1 && msg.server_id) return;
        Meteor._debug('discarding invalid livedata message', msg);
      }
      return;
    }

    // Important: This was missing from previous version
    // We need to set the current version before routing the message
    if (msg.msg === 'connected') {
      this._connection._version = this._connection._versionSuggestion;
    }

    await this._routeMessage(msg);
  }

  /**
   * Routes messages to their appropriate handlers based on message type
   * @private
   * @param {Object} msg The parsed DDP message
   */
  async _routeMessage(msg) {
    switch (msg.msg) {
      case 'connected':
        await this._connection._livedata_connected(msg);
        this._connection.options.onConnected();
        break;

      case 'failed':
        await this._handleFailedMessage(msg);
        break;

      case 'ping':
        if (this._connection.options.respondToPings) {
          this._connection._send({ msg: 'pong', id: msg.id });
        }
        break;

      case 'pong':
        // noop, as we assume everything's a pong
        break;

      case 'added':
      case 'changed':
      case 'removed':
      case 'ready':
      case 'updated':
        await this._connection._livedata_data(msg);
        break;

      case 'nosub':
        await this._connection._livedata_nosub(msg);
        break;

      case 'result':
        await this._connection._livedata_result(msg);
        break;

      case 'error':
        this._connection._livedata_error(msg);
        break;

      default:
        Meteor._debug('discarding unknown livedata message type', msg);
    }
  }

  /**
   * Handles failed connection messages
   * @private
   * @param {Object} msg The failed message object
   */
  _handleFailedMessage(msg) {
    if (this._connection._supportedDDPVersions.indexOf(msg.version) >= 0) {
      this._connection._versionSuggestion = msg.version;
      this._connection._stream.reconnect({ _force: true });
    } else {
      const description =
        'DDP version negotiation failed; server requested version ' +
        msg.version;
      this._connection._stream.disconnect({ _permanent: true, _error: description });
      this._connection.options.onDDPVersionNegotiationFailure(description);
    }
  }

  /**
   * Handles connection reset events
   */
  onReset() {
    // Reset is called even on the first connection, so this is
    // the only place we send this message.
    const msg = this._buildConnectMessage();
    this._connection._send(msg);

    // Mark non-retry calls as failed and handle outstanding methods
    this._handleOutstandingMethodsOnReset();

    // Now, to minimize setup latency, go ahead and blast out all of
    // our pending methods ands subscriptions before we've even taken
    // the necessary RTT to know if we successfully reconnected.
    this._connection._callOnReconnectAndSendAppropriateOutstandingMethods();
    this._resendSubscriptions();
  }

  /**
   * Builds the initial connect message
   * @private
   * @returns {Object} The connect message object
   */
  _buildConnectMessage() {
    const msg = { msg: 'connect' };
    if (this._connection._lastSessionId) {
      msg.session = this._connection._lastSessionId;
    }
    msg.version = this._connection._versionSuggestion || this._connection._supportedDDPVersions[0];
    this._connection._versionSuggestion = msg.version;
    msg.support = this._connection._supportedDDPVersions;
    return msg;
  }

  /**
   * Handles outstanding methods during a reset
   * @private
   */
  _handleOutstandingMethodsOnReset() {
    const blocks = this._connection._outstandingMethodBlocks;
    if (blocks.length === 0) return;

    const currentMethodBlock = blocks[0].methods;
    blocks[0].methods = currentMethodBlock.filter(
      methodInvoker => {
        // Methods with 'noRetry' option set are not allowed to re-send after
        // recovering dropped connection.
        if (methodInvoker.sentMessage && methodInvoker.noRetry) {
          methodInvoker.receiveResult(
            new Meteor.Error(
              'invocation-failed',
              'Method invocation might have failed due to dropped connection. ' +
              'Failing because `noRetry` option was passed to Meteor.apply.'
            )
          );
        }

        // Only keep a method if it wasn't sent or it's allowed to retry.
        return !(methodInvoker.sentMessage && methodInvoker.noRetry);
      }
    );

    // Clear empty blocks
    if (blocks.length > 0 && blocks[0].methods.length === 0) {
      blocks.shift();
    }

    // Reset all method invokers as unsent
    Object.values(this._connection._methodInvokers).forEach(invoker => {
      invoker.sentMessage = false;
    });
  }

  /**
   * Resends all active subscriptions
   * @private
   */
  _resendSubscriptions() {
    Object.entries(this._connection._subscriptions).forEach(([id, sub]) => {
      this._connection._sendQueued({
        msg: 'sub',
        id: id,
        name: sub.name,
        params: sub.params
      });
    });
  }
}