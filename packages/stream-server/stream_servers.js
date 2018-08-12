/**
 * List of stream servers
 *
 * DDP LiveData server will load the latest added stream server.
 * You need place custom stream server package in `.meteor/packages`
 * before packages `meteor-tools`, ddp` or `ddp-server`
 * @type {(StreamServer|*)[]}
 */
StreamServers = [];

// By default load the SockJS implementation of WebSocket server with XHR polling fallback
StreamServers.push(StreamServer);

// If `.meteor/packages` has line with `stream-server-uws` load uWebSockets implementation of WebSocket server
if (typeof Package['stream-server-uws'] !== 'undefined') {
  /** @typedef {{StreamServerUWS: StreamServerUWS}} */
  const StreamServerUWS = Package['stream-server-uws'].StreamServerUWS;
  StreamServers.push(
    StreamServerUWS
  )
}