import { EventEmitter } from 'events';

/**
 * Wrapper around a raw WebSocket connection that provides the same
 * interface as a SockJS connection, as expected by _onConnection
 * and livedata_server.js.
 *
 * Used by non-SockJS transports that provide a standard WebSocket
 * object. The uws transport implements its own socket interface directly.
 */
export class RawWebSocketConnection extends EventEmitter {
  constructor(ws, req, rawSocket, messageAdapter) {
    super();
    this._ws = ws;
    this._rawSocket = rawSocket;
    this.protocol = 'websocket-raw';
    this.id = Random.id();

    // Copy relevant headers (same set as SockJS transport.js)
    this.headers = {};
    const headerKeys = [
      'referer', 'x-client-ip', 'x-forwarded-for',
      'x-forwarded-host', 'x-forwarded-port', 'x-cluster-client-ip',
      'via', 'x-real-ip', 'x-forwarded-proto', 'x-ssl', 'dnt',
      'host', 'user-agent', 'accept-language'
    ];
    for (const key of headerKeys) {
      if (req.headers[key]) this.headers[key] = req.headers[key];
    }

    this.remoteAddress = rawSocket.remoteAddress;
    this.remotePort = rawSocket.remotePort;
    this.url = req.url;

    // Compatibility with SockJS internals that stream_server accesses
    this._session = {
      recv: {
        connection: rawSocket,
        protocol: 'websocket-raw'
      }
    };

    // messageAdapter extracts the string data from the transport's message event.
    // Each transport has a different message event signature.
    ws.on('message', (...args) => {
      var str = messageAdapter(...args);
      if (str != null) this.emit('data', str);
    });

    ws.on('close', () => {
      this.emit('close');
      this._ws = null;
    });

    ws.on('error', () => {
      this.emit('close');
      this._ws = null;
    });
  }

  write(data) {
    if (this._ws) this._ws.send(data);
  }

  send(data) {
    this.write(data);
  }

  close() {
    if (this._ws) this._ws.close();
  }

  setWebsocketTimeout(timeout) {
    if (this._rawSocket) {
      this._rawSocket.setTimeout(timeout);
    }
  }
}
