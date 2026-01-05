var Anser = require("anser");
var runLog = require('./run-log.js');

// options: listenPort, proxyToPort, proxyToHost,
// onFailure, ignoredUrls
var Proxy = function (options) {
  var self = this;

  self.listenPort = options.listenPort;
  self.listenHost = options.listenHost;
  // note: run-all.js updates proxyToPort directly
  self.proxyToPort = options.proxyToPort;
  self.proxyToHost = options.proxyToHost || '127.0.0.1';
  self.onFailure = options.onFailure || function () {};
  self.ignoredUrls = options.ignoredUrls || [];

  self.mode = "hold";
  self.httpQueue = []; // keys: req, res
  self.websocketQueue = []; // keys: req, socket, head

  self.proxy = null;
  self.server = null;
};

Object.assign(Proxy.prototype, {
  // Start the proxy server, block (yield) until it is ready to go
  // (actively listening on outer and proxying to inner), and then
  // return.
  start: async function () {
    var self = this;

    if (self.server) {
      throw new Error("already running?");
    }

    self.started = false;

    var http = require('http');
    var net = require('net');
    var httpProxy = require('http-proxy');

    self.proxy = httpProxy.createProxyServer({
      // agent is required to handle keep-alive, and http-proxy 1.0 is a little
      // buggy without it: https://github.com/nodejitsu/node-http-proxy/pull/488
      agent: new http.Agent({ maxSockets: 100 }),
      xfwd: true
    });

    var server = self.server = http.createServer(function (req, res) {
      // Normal HTTP request
      if (self.ignoredUrls.includes(req.url)) {
        return;
      }

      self.httpQueue.push({ req: req, res: res });
      self._tryHandleConnections();
    });

    self.server.on('upgrade', function (req, socket, head) {
      if (self.ignoredUrls.includes(req.url)) {
        return;
      }

      // Websocket connection
      self.websocketQueue.push({ req: req, socket: socket, head: head });
      self._tryHandleConnections();
    });

    var allowStart;
    var promise = new Promise(function (resolve) {
      allowStart = resolve;
    });

    self.server.on('error', async function (err) {
      if (err.code === 'EADDRINUSE') {
        var port = self.listenPort;
        runLog.log(
"Can't listen on port " + port + ". Perhaps another Meteor is running?\n" +
"\n" +
"Running two copies of Meteor in the same application directory\n" +
"will not work. If something else is using port " + port + ", you can\n" +
"specify an alternative port with --port <port>.");
      } else if (self.listenHost &&
                 (err.code === 'ENOTFOUND' || err.code === 'EADDRNOTAVAIL')) {
        // This handles the case of "entered a DNS name that's unknown"
        // (ENOTFOUND from getaddrinfo) and "entered some random IP that we
        // can't bind to" (EADDRNOTAVAIL from listen).
        runLog.log(
"Can't listen on host " + self.listenHost + " (" + err.code + " from " +
            err.syscall + ").");

      } else {
        runLog.log('' + err);
      }
      await self.onFailure();
      allowStart();
    });

    // Don't crash if the app doesn't respond. instead return an error
    // immediately. This shouldn't happen much since we try to not
    // send requests if the app is down.
    //
    // Currently, this error is emitted if the proxy->server connection has an
    // error (whether in HTTP or websocket proxying).  It is not emitted if the
    // client->proxy connection has an error, though this may change; see
    // discussion at https://github.com/nodejitsu/node-http-proxy/pull/488
    self.proxy.on('error', function (err, req, resOrSocket) {
      if (err.code === 'HPE_HEADER_OVERFLOW') {
        const logMessage = 'Error during proxy to server communication ' +
          'due to the header size exceeding Node\'s currently ' +
          'configured limit. This limit is configurable with a command ' +
          'line option (https://nodejs.org/api/cli.html#cli_max_http_header_size_size ' +
          'and https://docs.meteor.com/commandline.html#meteorrun).';
        runLog.log(logMessage);
      }

      if (resOrSocket instanceof http.ServerResponse) {
        if (!resOrSocket.headersSent) {
          // Return a 503, but only if we haven't already written headers (or
          // we'll get an ugly crash about rendering headers twice).  end()
          // doesn't crash if called twice so we don't have to conditionalize
          // that call.
          resOrSocket.writeHead(503, {
            'Content-Type': 'text/plain'
          });
        }
        resOrSocket.end('Unexpected error.');
      } else if (resOrSocket instanceof net.Socket) {
        resOrSocket.end();
      }
    });

    self.server.listen(self.listenPort, self.listenHost || '0.0.0.0', function () {
      if (self.server) {
        self.started = true;
      } else {
        // stop() got called while we were invoking listen! Close the server (we
        // still have the var server). The rest of the cleanup shouldn't be
        // necessary.
        server.close();
      }
      allowStart();
    });

    await promise;
  },

  // Idempotent.
  stop: function () {
    var self = this;

    if (! self.server) {
      return;
    }

    if (! self.started) {
      // This probably means that we failed to listen. However, there could be a
      // race condition and we could be in the middle of starting to listen! In
      // that case, the listen callback will notice that we nulled out server
      // here.
      self.server = null;
      return;
    }

    // This stops listening but allows existing connections to
    // complete gracefully.
    self.server.close();
    self.server = null;

    // It doesn't seem to be necessary to do anything special to
    // destroy an httpProxy proxyserver object.
    self.proxy = null;

    // Drop any held connections.
    self.httpQueue?.forEach(function (c) {
      c.res.statusCode = 500;
      c.res.end();
    });
    self.httpQueue = [];

    self.websocketQueue?.forEach(function (c) {
      c.socket.destroy();
    });
    self.websocketQueue = [];

    self.mode = "hold";
  },

  _tryHandleConnections: function () {
    var self = this;

    function attempt(resOrSocket, fn) {
      try {
        return fn();
      } catch (e) {
        if (typeof resOrSocket.writeHead === "function") {
          resOrSocket.writeHead(400, {
            'Content-Type': 'text/plain'
          });
        }
        resOrSocket.end("Bad request\n");
      }
    }

    while (self.httpQueue.length) {
      if (self.mode !== "errorpage" && self.mode !== "proxy") {
        break;
      }

      var c = self.httpQueue.shift();
      if (self.mode === "errorpage") {
        showErrorPage(c.res);
      } else {
        attempt(c.res, () => self.proxy.web(c.req, c.res, {
          target: 'http://' + self.proxyToHost + ':' + self.proxyToPort
        }));
      }
    }

    while (self.websocketQueue.length) {
      if (self.mode !== "proxy") {
        break;
      }

      var c = self.websocketQueue.shift();
      attempt(c.socket, () => self.proxy.ws(c.req, c.socket, c.head, {
        target: 'http://' + self.proxyToHost + ':' + self.proxyToPort
      }));
    }
  },

  // The proxy can be in one of three modes:
  // - "hold": hold connections until the mode changes
  // - "proxy": connections are proxied to the configured port
  // - "errorpage": an error page is served to HTTP connections, and
  //   websocket connections are held
  //
  // The initial mode is "hold".
  setMode: function (mode) {
    var self = this;
    self.mode = mode;
    self._tryHandleConnections();
  }
});

function showErrorPage(res) {
  // TODO: reload when the server comes back up
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(`
<!DOCTYPE html>
<html>
  <head>
    <title>Meteor App - Error</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style type='text/css'>
      :root {
        --bg-color: #ffffff;
        --text-color: #333333;
        --header-bg: #f4f4f5;
        --header-color: #333333;
        --border-color: #e2e2e2;
        --accent-color: #de4f4f;
        --code-bg: #f7f7f7;
      }
      
      @media (prefers-color-scheme: dark) {
        :root {
          --bg-color: #1a1a1a;
          --text-color: #e0e0e0;
          --header-bg: #2a2a2a;
          --header-color: #ffffff;
          --border-color: #444444;
          --accent-color: #ff6b6b;
          --code-bg: #2c2c2c;
        }
      }
      
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: var(--bg-color);
        color: var(--text-color);
        line-height: 1.6;
      }
      
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 20px;
      }
      
      header {
        background: var(--header-bg);
        color: var(--header-color);
        padding: 20px;
        border-bottom: 1px solid var(--border-color);
      }
      
      h1 {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 5px;
      }
      
      .subtitle {
        font-size: 16px;
        opacity: 0.8;
      }
      
      .log-container {
        margin: 20px 0;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        overflow: hidden;
      }
      
      .log-header {
        padding: 10px 15px;
        background-color: var(--header-bg);
        border-bottom: 1px solid var(--border-color);
        font-weight: 600;
      }
      
      .log-content {
        background-color: var(--code-bg);
        padding: 15px;
        overflow-x: auto;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        width: 100%;
        display: block;
      }
      
      .meteor-logo {
        color: var(--accent-color);
        font-weight: bold;
      }
      
      .hint, .links {
        margin-top: 20px;
        padding: 15px;
        background-color: var(--header-bg);
        border-radius: 4px;
        font-size: 14px;
      }
      
      .links {
        display: flex;
        justify-content: center;
        gap: 20px;
        padding: 20px 15px;
      }
      
      .links a {
        color: var(--accent-color);
        text-decoration: none;
        font-weight: 500;
        padding: 8px 16px;
        border-radius: 4px;
        transition: all 0.2s ease;
        border: 1px solid var(--border-color);
        background-color: var(--bg-color);
      }
      
      .links a:hover {
        background-color: var(--accent-color);
        color: white;
        border-color: var(--accent-color);
      }
    </style>
  </head>

  <body>
    <header>
      <div class="container">
        <h1><span class="meteor-logo">Meteor</span> App Error</h1>
        <div class="subtitle">Your application server has encountered an error</div>
      </div>
    </header>
    
    <div class="container">
      <div class="log-container">
        <div class="log-header">Server Log</div>
        <code class="log-content">`);

  for (const item of runLog.getLog()) {
    res.write(Anser.ansiToHtml(Anser.escapeForHtml(item.message)) + "\n");
  }

  res.write(`</code>
      </div>
      
      <div class="hint">
        Fix the error in your code and save your files. Once your server is running without errors, then reload this page.
      </div>
      <div class="links">
        <a href="https://docs.meteor.com" target="_blank" rel="noreferrer noopener">Docs</a>
        <a href="https://guide.meteor.com" target="_blank" rel="noreferrer noopener">Guide</a>
        <a href="https://forums.meteor.com" target="_blank" rel="noreferrer noopener">Forums</a>
        <a href="https://discord.com/invite/3w7EKdpghq" target="_blank" rel="noreferrer noopener">Discord</a>
      </div>
    </div>
  </body>
</html>`);

  res.end();
}

exports.Proxy = Proxy;
