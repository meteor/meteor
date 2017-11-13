# `sockjs-shim`
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/sockjs-shim) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/sockjs-shim)
***

This package uses the `server-render` package to append a `<script>` tag
to the `<head>` of each HTML response that loads the
[SockJS](https://github.com/sockjs/sockjs-client) library, *unless* the
the user agent of the HTTP request clearly indicates that the browser does
not need a WebSocket polyfill.
