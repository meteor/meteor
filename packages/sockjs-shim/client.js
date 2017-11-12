// When the server.js module does not inject a <script> tag into the
// <head> of the document, we still need a fake global shim for SockJS.
global.SockJS = global.SockJS ||
function SockJS(url, protocolWhitelist, options) {
  const {
    toWebsocketUrl,
  } = require("meteor/ddp-client/common/urlHelpers.js");
  return new WebSocket(toWebsocketUrl(url));
};
