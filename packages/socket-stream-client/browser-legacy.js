// Don't import SockJS for legacy or unknown browsers that supports WebSockets
if (!(Package['disable-sockjs']
  && typeof WebSocket !== 'undefined')) {
  import("./sockjs-0.3.4.js");
}
