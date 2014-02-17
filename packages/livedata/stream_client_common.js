// XXX from Underscore.String (http://epeli.github.com/underscore.string/)
var startsWith = function(str, starts) {
  return str.length >= starts.length &&
    str.substring(0, starts.length) === starts;
};
var endsWith = function(str, ends) {
  return str.length >= ends.length &&
    str.substring(str.length - ends.length) === ends;
};

// @param url {String} URL to Meteor app, eg:
//   "/" or "madewith.meteor.com" or "https://foo.meteor.com"
//   or "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"
// @returns {String} URL to the endpoint with the specific scheme and subPath, e.g.
// for scheme "http" and subPath "sockjs"
//   "http://subdomain.meteor.com/sockjs" or "/sockjs"
//   or "https://ddp--1234-foo.meteor.com/sockjs"
var translateUrl =  function(url, newSchemeBase, subPath) {
  if (! newSchemeBase) {
    newSchemeBase = "http";
  }

  var ddpUrlMatch = url.match(/^ddp(i?)\+sockjs:\/\//);
  var httpUrlMatch = url.match(/^http(s?):\/\//);
  var newScheme;
  if (ddpUrlMatch) {
    // Remove scheme and split off the host.
    var urlAfterDDP = url.substr(ddpUrlMatch[0].length);
    newScheme = ddpUrlMatch[1] === "i" ? newSchemeBase : newSchemeBase + "s";
    var slashPos = urlAfterDDP.indexOf('/');
    var host =
          slashPos === -1 ? urlAfterDDP : urlAfterDDP.substr(0, slashPos);
    var rest = slashPos === -1 ? '' : urlAfterDDP.substr(slashPos);

    // In the host (ONLY!), change '*' characters into random digits. This
    // allows different stream connections to connect to different hostnames
    // and avoid browser per-hostname connection limits.
    host = host.replace(/\*/g, function () {
      return Math.floor(Random.fraction()*10);
    });

    return newScheme + '://' + host + rest;
  } else if (httpUrlMatch) {
    newScheme = !httpUrlMatch[1] ? newSchemeBase : newSchemeBase + "s";
    var urlAfterHttp = url.substr(httpUrlMatch[0].length);
    url = newScheme + "://" + urlAfterHttp;
  }

  // Prefix FQDNs but not relative URLs
  if (url.indexOf("://") === -1 && !startsWith(url, "/")) {
    url = newSchemeBase + "://" + url;
  }

  // XXX This is not what we should be doing: if I have a site
  // deployed at "/foo", then DDP.connect("/") should actually connect
  // to "/", not to "/foo". "/" is an absolute path. (Contrast: if
  // deployed at "/foo", it would be reasonable for DDP.connect("bar")
  // to connect to "/foo/bar").
  //
  // We should make this properly honor absolute paths rather than
  // forcing the path to be relative to the site root. Simultaneously,
  // we should set DDP_DEFAULT_CONNECTION_URL to include the site
  // root. See also client_convenience.js #RationalizingRelativeDDPURLs
  url = Meteor._relativeToSiteRootUrl(url);

  if (endsWith(url, "/"))
    return url + subPath;
  else
    return url + "/" + subPath;
};

toSockjsUrl = function (url) {
  return translateUrl(url, "http", "sockjs");
};

toWebsocketUrl = function (url) {
  var ret = translateUrl(url, "ws", "websocket");
  return ret;
};

LivedataTest.toSockjsUrl = toSockjsUrl;


_.extend(LivedataTest.ClientStream.prototype, {

  // Register for callbacks.
  on: function (name, callback) {
    var self = this;

    if (name !== 'message' && name !== 'reset')
      throw new Error("unknown event type: " + name);

    if (!self.eventCallbacks[name])
      self.eventCallbacks[name] = [];
    self.eventCallbacks[name].push(callback);
  },


  _initCommon: function () {
    var self = this;
    //// Constants

    // how long to wait until we declare the connection attempt
    // failed.
    self.CONNECT_TIMEOUT = 10000;

    self.eventCallbacks = {}; // name -> [callback]

    self._forcedToDisconnect = false;

    //// Reactive status
    self.currentStatus = {
      status: "connecting",
      connected: false,
      retryCount: 0
    };


    self.statusListeners = typeof Deps !== 'undefined' && new Deps.Dependency;
    self.statusChanged = function () {
      if (self.statusListeners)
        self.statusListeners.changed();
    };

    //// Retry logic
    self._retry = new Retry;
    self.connectionTimer = null;

  },

  // Trigger a reconnect.
  reconnect: function (options) {
    var self = this;
    options = options || {};

    if (options.url) {
      self._changeUrl(options.url);
    }

    if (options._sockjsOptions) {
      self.options._sockjsOptions = options._sockjsOptions;
    }

    if (self.currentStatus.connected) {
      if (options._force || options.url) {
        // force reconnect.
        self._lostConnection();
      } // else, noop.
      return;
    }

    // if we're mid-connection, stop it.
    if (self.currentStatus.status === "connecting") {
      self._lostConnection();
    }

    self._retry.clear();
    self.currentStatus.retryCount -= 1; // don't count manual retries
    self._retryNow();
  },

  disconnect: function (options) {
    var self = this;
    options = options || {};

    // Failed is permanent. If we're failed, don't let people go back
    // online by calling 'disconnect' then 'reconnect'.
    if (self._forcedToDisconnect)
      return;

    // If _permanent is set, permanently disconnect a stream. Once a stream
    // is forced to disconnect, it can never reconnect. This is for
    // error cases such as ddp version mismatch, where trying again
    // won't fix the problem.
    if (options._permanent) {
      self._forcedToDisconnect = true;
    }

    self._cleanup();
    self._retry.clear();

    self.currentStatus = {
      status: (options._permanent ? "failed" : "offline"),
      connected: false,
      retryCount: 0
    };

    if (options._permanent && options._error)
      self.currentStatus.reason = options._error;

    self.statusChanged();
  },

  _lostConnection: function () {
    var self = this;

    self._cleanup();
    self._retryLater(); // sets status. no need to do it here.
  },

  // fired when we detect that we've gone online. try to reconnect
  // immediately.
  _online: function () {
    // if we've requested to be offline by disconnecting, don't reconnect.
    if (this.currentStatus.status != "offline")
      this.reconnect();
  },

  _retryLater: function () {
    var self = this;

    var timeout = 0;
    if (self.options.retry) {
      timeout = self._retry.retryLater(
        self.currentStatus.retryCount,
        _.bind(self._retryNow, self)
      );
    }

    self.currentStatus.status = "waiting";
    self.currentStatus.connected = false;
    self.currentStatus.retryTime = (new Date()).getTime() + timeout;
    self.statusChanged();
  },

  _retryNow: function () {
    var self = this;

    if (self._forcedToDisconnect)
      return;

    self.currentStatus.retryCount += 1;
    self.currentStatus.status = "connecting";
    self.currentStatus.connected = false;
    delete self.currentStatus.retryTime;
    self.statusChanged();

    self._launchConnection();
  },


  // Get current status. Reactive.
  status: function () {
    var self = this;
    if (self.statusListeners)
      self.statusListeners.depend();
    return self.currentStatus;
  }
});
