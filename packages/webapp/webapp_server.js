////////// Requires //////////

var fs = Npm.require("fs");
var http = Npm.require("http");
var os = Npm.require("os");
var path = Npm.require("path");
var url = Npm.require("url");
var crypto = Npm.require("crypto");

var connect = Npm.require('connect');
var useragent = Npm.require('useragent');
var send = Npm.require('send');

var SHORT_SOCKET_TIMEOUT = 5*1000;
var LONG_SOCKET_TIMEOUT = 120*1000;

WebApp = {};
WebAppInternals = {};

var bundledJsCssPrefix;

// The reload safetybelt is some js that will be loaded after everything else in
// the HTML.  In some multi-server deployments, when you update, you have a
// chance of hitting an old server for the HTML and the new server for the JS or
// CSS.  This prevents you from displaying the page in that case, and instead
// reloads it, presumably all on the new version now.
var RELOAD_SAFETYBELT = "\n" +
      "if (typeof Package === 'undefined' || \n" +
      "    ! Package.webapp || \n" +
      "    ! Package.webapp.WebApp || \n" +
      "    ! Package.webapp.WebApp._isCssLoaded()) \n" +
      "  document.location.reload(); \n";

// Keepalives so that when the outer server dies unceremoniously and
// doesn't kill us, we quit ourselves. A little gross, but better than
// pidfiles.
// XXX This should really be part of the boot script, not the webapp package.
//     Or we should just get rid of it, and rely on containerization.

var initKeepalive = function () {
  var keepaliveCount = 0;

  process.stdin.on('data', function (data) {
    keepaliveCount = 0;
  });

  process.stdin.resume();

  setInterval(function () {
    keepaliveCount ++;
    if (keepaliveCount >= 3) {
      console.log("Failed to receive keepalive! Exiting.");
      process.exit(1);
    }
  }, 3000);
};


var sha1 = function (contents) {
  var hash = crypto.createHash('sha1');
  hash.update(contents);
  return hash.digest('hex');
};

// #BrowserIdentification
//
// We have multiple places that want to identify the browser: the
// unsupported browser page, the appcache package, and, eventually
// delivering browser polyfills only as needed.
//
// To avoid detecting the browser in multiple places ad-hoc, we create a
// Meteor "browser" object. It uses but does not expose the npm
// useragent module (we could choose a different mechanism to identify
// the browser in the future if we wanted to).  The browser object
// contains
//
// * `name`: the name of the browser in camel case
// * `major`, `minor`, `patch`: integers describing the browser version
//
// Also here is an early version of a Meteor `request` object, intended
// to be a high-level description of the request without exposing
// details of connect's low-level `req`.  Currently it contains:
//
// * `browser`: browser identification object described above
// * `url`: parsed url, including parsed query params
//
// As a temporary hack there is a `categorizeRequest` function on WebApp which
// converts a connect `req` to a Meteor `request`. This can go away once smart
// packages such as appcache are being passed a `request` object directly when
// they serve content.
//
// This allows `request` to be used uniformly: it is passed to the html
// attributes hook, and the appcache package can use it when deciding
// whether to generate a 404 for the manifest.
//
// Real routing / server side rendering will probably refactor this
// heavily.


// e.g. "Mobile Safari" => "mobileSafari"
var camelCase = function (name) {
  var parts = name.split(' ');
  parts[0] = parts[0].toLowerCase();
  for (var i = 1;  i < parts.length;  ++i) {
    parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].substr(1);
  }
  return parts.join('');
};

var identifyBrowser = function (userAgentString) {
  var userAgent = useragent.lookup(userAgentString);
  return {
    name: camelCase(userAgent.family),
    major: +userAgent.major,
    minor: +userAgent.minor,
    patch: +userAgent.patch
  };
};

// XXX Refactor as part of implementing real routing.
WebAppInternals.identifyBrowser = identifyBrowser;

WebApp.categorizeRequest = function (req) {
  return {
    browser: identifyBrowser(req.headers['user-agent']),
    url: url.parse(req.url, true)
  };
};

// HTML attribute hooks: functions to be called to determine any attributes to
// be added to the '<html>' tag. Each function is passed a 'request' object (see
// #BrowserIdentification) and should return a string,
var htmlAttributeHooks = [];
var htmlAttributes = function (template, request) {
  var attributes = '';
  _.each(htmlAttributeHooks || [], function (hook) {
    var attribute = hook(request);
    if (attribute !== null && attribute !== undefined && attribute !== '')
      attributes += ' ' + attribute;
  });
  return template.replace('##HTML_ATTRIBUTES##', attributes);
};
WebApp.addHtmlAttributeHook = function (hook) {
  htmlAttributeHooks.push(hook);
};

// Serve app HTML for this URL?
var appUrl = function (url) {
  if (url === '/favicon.ico' || url === '/robots.txt')
    return false;

  // NOTE: app.manifest is not a web standard like favicon.ico and
  // robots.txt. It is a file name we have chosen to use for HTML5
  // appcache URLs. It is included here to prevent using an appcache
  // then removing it from poisoning an app permanently. Eventually,
  // once we have server side routing, this won't be needed as
  // unknown URLs with return a 404 automatically.
  if (url === '/app.manifest')
    return false;

  // Avoid serving app HTML for declared routes such as /sockjs/.
  if (RoutePolicy.classify(url))
    return false;

  // we currently return app HTML on all URLs by default
  return true;
};


// Calculate a hash of all the client resources downloaded by the
// browser, including the application HTML, runtime config, code, and
// static files.
//
// This hash *must* change if any resources seen by the browser
// change, and ideally *doesn't* change for any server-only changes
// (but the second is a performance enhancement, not a hard
// requirement).

var calculateClientHash = function () {
  var hash = crypto.createHash('sha1');
  hash.update(JSON.stringify(__meteor_runtime_config__), 'utf8');
  _.each(WebApp.clientProgram.manifest, function (resource) {
    if (resource.where === 'client' || resource.where === 'internal') {
      hash.update(resource.path);
      hash.update(resource.hash);
    }
  });
  return hash.digest('hex');
};


// We need to calculate the client hash after all packages have loaded
// to give them a chance to populate __meteor_runtime_config__.
//
// Calculating the hash during startup means that packages can only
// populate __meteor_runtime_config__ during load, not during startup.
//
// Calculating instead it at the beginning of main after all startup
// hooks had run would allow packages to also populate
// __meteor_runtime_config__ during startup, but that's too late for
// autoupdate because it needs to have the client hash at startup to
// insert the auto update version itself into
// __meteor_runtime_config__ to get it to the client.
//
// An alternative would be to give autoupdate a "post-start,
// pre-listen" hook to allow it to insert the auto update version at
// the right moment.

Meteor.startup(function () {
  WebApp.clientHash = calculateClientHash();
});



// When we have a request pending, we want the socket timeout to be long, to
// give ourselves a while to serve it, and to allow sockjs long polls to
// complete.  On the other hand, we want to close idle sockets relatively
// quickly, so that we can shut down relatively promptly but cleanly, without
// cutting off anyone's response.
WebApp._timeoutAdjustmentRequestCallback = function (req, res) {
  // this is really just req.socket.setTimeout(LONG_SOCKET_TIMEOUT);
  req.setTimeout(LONG_SOCKET_TIMEOUT);
  // Insert our new finish listener to run BEFORE the existing one which removes
  // the response from the socket.
  var finishListeners = res.listeners('finish');
  // XXX Apparently in Node 0.12 this event is now called 'prefinish'.
  // https://github.com/joyent/node/commit/7c9b6070
  res.removeAllListeners('finish');
  res.on('finish', function () {
    res.setTimeout(SHORT_SOCKET_TIMEOUT);
  });
  _.each(finishListeners, function (l) { res.on('finish', l); });
};

var runWebAppServer = function () {
  var shuttingDown = false;
  // read the control for the client we'll be serving up
  var clientJsonPath = path.join(__meteor_bootstrap__.serverDir,
                                 __meteor_bootstrap__.configJson.client);
  var clientDir = path.dirname(clientJsonPath);
  var clientJson = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));

  if (clientJson.format !== "browser-program-pre1")
    throw new Error("Unsupported format for client assets: " +
                    JSON.stringify(clientJson.format));

  // webserver
  var app = connect();

  // Auto-compress any json, javascript, or text.
  app.use(connect.compress());

  // Packages and apps can add handlers that run before any other Meteor
  // handlers via WebApp.rawConnectHandlers.
  var rawConnectHandlers = connect();
  app.use(rawConnectHandlers);

  // Strip off the path prefix, if it exists.
  app.use(function (request, response, next) {
    var pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;
    var url = Npm.require('url').parse(request.url);
    var pathname = url.pathname;
    // check if the path in the url starts with the path prefix (and the part
    // after the path prefix must start with a / if it exists.)
    if (pathPrefix && pathname.substring(0, pathPrefix.length) === pathPrefix &&
       (pathname.length == pathPrefix.length
        || pathname.substring(pathPrefix.length, pathPrefix.length + 1) === "/")) {
      request.url = request.url.substring(pathPrefix.length);
      next();
    } else if (pathname === "/favicon.ico" || pathname === "/robots.txt") {
      next();
    } else if (pathPrefix) {
      response.writeHead(404);
      response.write("Unknown path");
      response.end();
    } else {
      next();
    }
  });

  // Parse the query string into res.query. Used by oauth_server, but it's
  // generally pretty handy..
  app.use(connect.query());

  var getItemPathname = function (itemUrl) {
    return decodeURIComponent(url.parse(itemUrl).pathname);
  };

  var staticFiles = {};
  _.each(clientJson.manifest, function (item) {
    if (item.url && item.where === "client") {
      staticFiles[getItemPathname(item.url)] = {
        path: item.path,
        cacheable: item.cacheable,
        // Link from source to its map
        sourceMapUrl: item.sourceMapUrl
      };

      if (item.sourceMap) {
        // Serve the source map too, under the specified URL. We assume all
        // source maps are cacheable.
        staticFiles[getItemPathname(item.sourceMapUrl)] = {
          path: item.sourceMap,
          cacheable: true
        };
      }
    }
  });


  // Serve static files from the manifest.
  // This is inspired by the 'static' middleware.
  app.use(function (req, res, next) {
    if ('GET' != req.method && 'HEAD' != req.method) {
      next();
      return;
    }
    var pathname = connect.utils.parseUrl(req).pathname;

    try {
      pathname = decodeURIComponent(pathname);
    } catch (e) {
      next();
      return;
    }

    var serveStaticJs = function (s) {
      res.writeHead(200, { 'Content-type': 'application/javascript' });
      res.write(s);
      res.end();
    };

    if (pathname === "/meteor_runtime_config.js" &&
        ! WebAppInternals.inlineScriptsAllowed()) {
      serveStaticJs("__meteor_runtime_config__ = " +
                    JSON.stringify(__meteor_runtime_config__) + ";");
      return;
    } else if (pathname === "/meteor_reload_safetybelt.js" &&
               ! WebAppInternals.inlineScriptsAllowed()) {
      serveStaticJs(RELOAD_SAFETYBELT);
      return;
    }

    if (!_.has(staticFiles, pathname)) {
      next();
      return;
    }

    // We don't need to call pause because, unlike 'static', once we call into
    // 'send' and yield to the event loop, we never call another handler with
    // 'next'.

    var info = staticFiles[pathname];

    // Cacheable files are files that should never change. Typically
    // named by their hash (eg meteor bundled js and css files).
    // We cache them ~forever (1yr).
    //
    // We cache non-cacheable files anyway. This isn't really correct, as users
    // can change the files and changes won't propagate immediately. However, if
    // we don't cache them, browsers will 'flicker' when rerendering
    // images. Eventually we will probably want to rewrite URLs of static assets
    // to include a query parameter to bust caches. That way we can both get
    // good caching behavior and allow users to change assets without delay.
    // https://github.com/meteor/meteor/issues/773
    var maxAge = info.cacheable
          ? 1000 * 60 * 60 * 24 * 365
          : 1000 * 60 * 60 * 24;

    // Set the X-SourceMap header, which current Chrome understands.
    // (The files also contain '//#' comments which FF 24 understands and
    // Chrome doesn't understand yet.)
    //
    // Eventually we should set the SourceMap header but the current version of
    // Chrome and no version of FF supports it.
    //
    // To figure out if your version of Chrome should support the SourceMap
    // header,
    //   - go to chrome://version. Let's say the Chrome version is
    //      28.0.1500.71 and the Blink version is 537.36 (@153022)
    //   - go to http://src.chromium.org/viewvc/blink/branches/chromium/1500/Source/core/inspector/InspectorPageAgent.cpp?view=log
    //     where the "1500" is the third part of your Chrome version
    //   - find the first revision that is no greater than the "153022"
    //     number.  That's probably the first one and it probably has
    //     a message of the form "Branch 1500 - blink@r149738"
    //   - If *that* revision number (149738) is at least 151755,
    //     then Chrome should support SourceMap (not just X-SourceMap)
    // (The change is https://codereview.chromium.org/15832007)
    //
    // You also need to enable source maps in Chrome: open dev tools, click
    // the gear in the bottom right corner, and select "enable source maps".
    //
    // Firefox 23+ supports source maps but doesn't support either header yet,
    // so we include the '//#' comment for it:
    //   https://bugzilla.mozilla.org/show_bug.cgi?id=765993
    // In FF 23 you need to turn on `devtools.debugger.source-maps-enabled`
    // in `about:config` (it is on by default in FF 24).
    if (info.sourceMapUrl)
      res.setHeader('X-SourceMap', info.sourceMapUrl);
    send(req, path.join(clientDir, info.path))
      .maxage(maxAge)
      .hidden(true)  // if we specified a dotfile in the manifest, serve it
      .on('error', function (err) {
        Log.error("Error serving static file " + err);
        res.writeHead(500);
        res.end();
      })
      .on('directory', function () {
        Log.error("Unexpected directory " + info.path);
        res.writeHead(500);
        res.end();
      })
      .pipe(res);
  });

  // Packages and apps can add handlers to this via WebApp.connectHandlers.
  // They are inserted before our default handler.
  var packageAndAppHandlers = connect();
  app.use(packageAndAppHandlers);

  var suppressConnectErrors = false;
  // connect knows it is an error handler because it has 4 arguments instead of
  // 3. go figure.  (It is not smart enough to find such a thing if it's hidden
  // inside packageAndAppHandlers.)
  app.use(function (err, req, res, next) {
    if (!err || !suppressConnectErrors || !req.headers['x-suppress-error']) {
      next(err);
      return;
    }
    res.writeHead(err.status, { 'Content-Type': 'text/plain' });
    res.end("An error message");
  });

  // Will be updated by main before we listen.
  var boilerplateHtml = null;
  app.use(function (req, res, next) {
    if (! appUrl(req.url))
      return next();

    if (!boilerplateHtml)
      throw new Error("boilerplateHtml should be set before listening!");


    var headers = {
      'Content-Type':  'text/html; charset=utf-8'
    };
    if (shuttingDown)
      headers['Connection'] = 'Close';

    var request = WebApp.categorizeRequest(req);

    if (request.url.query && request.url.query['meteor_css_resource']) {
      // In this case, we're requesting a CSS resource in the meteor-specific
      // way, but we don't have it.  Serve a static css file that indicates that
      // we didn't have it, so we can detect that and refresh.
      headers['Content-Type'] = 'text/css; charset=utf-8';
      res.writeHead(200, headers);
      res.write(".meteor-css-not-found-error { width: 0px;}");
      res.end();
      return undefined;
    }
    res.writeHead(200, headers);
    var requestSpecificHtml = htmlAttributes(boilerplateHtml, request);
    res.write(requestSpecificHtml);
    res.end();
    return undefined;
  });

  // Return 404 by default, if no other handlers serve this URL.
  app.use(function (req, res) {
    res.writeHead(404);
    res.end();
  });


  var httpServer = http.createServer(app);
  var onListeningCallbacks = [];

  // After 5 seconds w/o data on a socket, kill it.  On the other hand, if
  // there's an outstanding request, give it a higher timeout instead (to avoid
  // killing long-polling requests)
  httpServer.setTimeout(SHORT_SOCKET_TIMEOUT);

  // Do this here, and then also in livedata/stream_server.js, because
  // stream_server.js kills all the current request handlers when installing its
  // own.
  httpServer.on('request', WebApp._timeoutAdjustmentRequestCallback);


  // For now, handle SIGHUP here.  Later, this should be in some centralized
  // Meteor shutdown code.
  process.on('SIGHUP', Meteor.bindEnvironment(function () {
    shuttingDown = true;
    // tell others with websockets open that we plan to close this.
    // XXX: Eventually, this should be done with a standard meteor shut-down
    // logic path.
    httpServer.emit('meteor-closing');

    httpServer.close(Meteor.bindEnvironment(function () {
      if (proxy) {
        try {
          proxy.call('removeBindingsForJob', process.env.GALAXY_JOB);
        } catch (e) {
          Log.error("Error removing bindings: " + e.message);
          process.exit(1);
        }
      }
      process.exit(0);

    }, "On http server close failed"));

    // Ideally we will close before this hits.
    Meteor.setTimeout(function () {
      Log.warn("Closed by SIGHUP but one or more HTTP requests may not have finished.");
      process.exit(1);
    }, 5000);

  }, function (err) {
    console.log(err);
    process.exit(1);
  }));

  // start up app
  _.extend(WebApp, {
    connectHandlers: packageAndAppHandlers,
    rawConnectHandlers: rawConnectHandlers,
    httpServer: httpServer,
    // metadata about the client program that we serve
    clientProgram: {
      manifest: clientJson.manifest
      // XXX do we need a "root: clientDir" field here? it used to be here but
      // was unused.
    },
    // For testing.
    suppressConnectErrors: function () {
      suppressConnectErrors = true;
    },
    onListening: function (f) {
      if (onListeningCallbacks)
        onListeningCallbacks.push(f);
      else
        f();
    },
    // Hack: allow http tests to call connect.basicAuth without making them
    // Npm.depends on another copy of connect. (That would be fine if we could
    // have test-only NPM dependencies but is overkill here.)
    __basicAuth__: connect.basicAuth
  });

  // Let the rest of the packages (and Meteor.startup hooks) insert connect
  // middlewares and update __meteor_runtime_config__, then keep going to set up
  // actually serving HTML.
  main = function (argv) {
    // main happens post startup hooks, so we don't need a Meteor.startup() to
    // ensure this happens after the galaxy package is loaded.
    var AppConfig = Package["application-configuration"].AppConfig;
    // We used to use the optimist npm package to parse argv here, but it's
    // overkill (and no longer in the dev bundle). Just assume any instance of
    // '--keepalive' is a use of the option.
    var expectKeepalives = _.contains(argv, '--keepalive');

    var boilerplateHtmlPath = path.join(clientDir, clientJson.page);
    boilerplateHtml = fs.readFileSync(boilerplateHtmlPath, 'utf8');

    // Include __meteor_runtime_config__ in the app html, as an inline script if
    // it's not forbidden by CSP.
    if (WebAppInternals.inlineScriptsAllowed()) {
      boilerplateHtml = boilerplateHtml.replace(
          /##RUNTIME_CONFIG##/,
        "<script type='text/javascript'>__meteor_runtime_config__ = " +
          JSON.stringify(__meteor_runtime_config__) + ";</script>");
      boilerplateHtml = boilerplateHtml.replace(
          /##RELOAD_SAFETYBELT##/,
        "<script type='text/javascript'>"+RELOAD_SAFETYBELT+"</script>");
    } else {
      boilerplateHtml = boilerplateHtml.replace(
        /##RUNTIME_CONFIG##/,
        "<script type='text/javascript' src='##ROOT_URL_PATH_PREFIX##/meteor_runtime_config.js'></script>"
      );
      boilerplateHtml = boilerplateHtml.replace(
          /##RELOAD_SAFETYBELT##/,
        "<script type='text/javascript' src='##ROOT_URL_PATH_PREFIX##/meteor_reload_safetybelt.js'></script>");

    }
    boilerplateHtml = boilerplateHtml.replace(
        /##ROOT_URL_PATH_PREFIX##/g,
      __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || "");

    boilerplateHtml = boilerplateHtml.replace(
        /##BUNDLED_JS_CSS_PREFIX##/g,
      bundledJsCssPrefix ||
        __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || "");

    // only start listening after all the startup code has run.
    var localPort = parseInt(process.env.PORT) || 0;
    var host = process.env.BIND_IP;
    var localIp = host || '0.0.0.0';
    httpServer.listen(localPort, localIp, Meteor.bindEnvironment(function() {
      if (expectKeepalives)
        console.log("LISTENING"); // must match run-app.js
      var proxyBinding;

      AppConfig.configurePackage('webapp', function (configuration) {
        if (proxyBinding)
          proxyBinding.stop();
        if (configuration && configuration.proxy) {
          // TODO: We got rid of the place where this checks the app's
          // configuration, because this wants to be configured for some things
          // on a per-job basis.  Discuss w/ teammates.
          proxyBinding = AppConfig.configureService(
            "proxy",
            "pre0",
            function (proxyService) {
              if (proxyService && ! _.isEmpty(proxyService)) {
                var proxyConf;
                // XXX Figure out a per-job way to specify bind location
                // (besides hardcoding the location for ADMIN_APP jobs).
                if (process.env.ADMIN_APP) {
                  var bindPathPrefix = "";
                  if (process.env.GALAXY_APP !== "panel") {
                    bindPathPrefix = "/" + bindPathPrefix +
                      encodeURIComponent(
                        process.env.GALAXY_APP
                      ).replace(/\./g, '_');
                  }
                  proxyConf = {
                    bindHost: process.env.GALAXY_NAME,
                    bindPathPrefix: bindPathPrefix,
                    requiresAuth: true
                  };
                } else {
                  proxyConf = configuration.proxy;
                }
                Log("Attempting to bind to proxy at " +
                    proxyService);
                WebAppInternals.bindToProxy(_.extend({
                  proxyEndpoint: proxyService
                }, proxyConf));
              }
            }
          );
        }
      });

      var callbacks = onListeningCallbacks;
      onListeningCallbacks = null;
      _.each(callbacks, function (x) { x(); });

    }, function (e) {
      console.error("Error listening:", e);
      console.error(e && e.stack);
    }));

    if (expectKeepalives)
      initKeepalive();
    return 'DAEMON';
  };
};


var proxy;
WebAppInternals.bindToProxy = function (proxyConfig) {
  var securePort = proxyConfig.securePort || 4433;
  var insecurePort = proxyConfig.insecurePort || 8080;
  var bindPathPrefix = proxyConfig.bindPathPrefix || "";
  // XXX also support galaxy-based lookup
  if (!proxyConfig.proxyEndpoint)
    throw new Error("missing proxyEndpoint");
  if (!proxyConfig.bindHost)
    throw new Error("missing bindHost");
  if (!process.env.GALAXY_JOB)
    throw new Error("missing $GALAXY_JOB");
  if (!process.env.GALAXY_APP)
    throw new Error("missing $GALAXY_APP");
  if (!process.env.LAST_START)
    throw new Error("missing $LAST_START");

  // XXX rename pid argument to bindTo.
  // XXX factor out into a 'getPid' function in a 'galaxy' package?
  var pid = {
    job: process.env.GALAXY_JOB,
    lastStarted: +(process.env.LAST_START),
    app: process.env.GALAXY_APP
  };
  var myHost = os.hostname();

  WebAppInternals.usingDdpProxy = true;

  // This is run after packages are loaded (in main) so we can use
  // Follower.connect.
  if (proxy) {
    // XXX the concept here is that our configuration has changed and
    // we have connected to an entirely new follower set, which does
    // not have the state that we set up on the follower set that we
    // were previously connected to, and so we need to recreate all of
    // our bindings -- analogous to getting a SIGHUP and rereading
    // your configuration file. so probably this should actually tear
    // down the connection and make a whole new one, rather than
    // hot-reconnecting to a different URL.
    proxy.reconnect({
      url: proxyConfig.proxyEndpoint
    });
  } else {
    proxy = Package["follower-livedata"].Follower.connect(
      proxyConfig.proxyEndpoint, {
        group: "proxy"
      }
    );
  }

  var route = process.env.ROUTE;
  var ourHost = route.split(":")[0];
  var ourPort = +route.split(":")[1];

  var outstanding = 0;
  var startedAll = false;
  var checkComplete = function () {
    if (startedAll && ! outstanding)
      Log("Bound to proxy.");
  };
  var makeCallback = function () {
    outstanding++;
    return function (err) {
      if (err)
        throw err;
      outstanding--;
      checkComplete();
    };
  };

  // for now, have our (temporary) requiresAuth flag apply to all
  // routes created by this process.
  var requiresDdpAuth = !! proxyConfig.requiresAuth;
  var requiresHttpAuth = (!! proxyConfig.requiresAuth) &&
        (pid.app !== "panel" && pid.app !== "auth");

  // XXX a current limitation is that we treat securePort and
  // insecurePort as a global configuration parameter -- we assume
  // that if the proxy wants us to ask for 8080 to get port 80 traffic
  // on our default hostname, that's the same port that we would use
  // to get traffic on some other hostname that our proxy listens
  // for. Likewise, we assume that if the proxy can receive secure
  // traffic for our domain, it can assume secure traffic for any
  // domain! Hopefully this will get cleaned up before too long by
  // pushing that logic into the proxy service, so we can just ask for
  // port 80.

  // XXX BUG: if our configuration changes, and bindPathPrefix
  // changes, it appears that we will not remove the routes derived
  // from the old bindPathPrefix from the proxy (until the process
  // exits). It is not actually normal for bindPathPrefix to change,
  // certainly not without a process restart for other reasons, but
  // it'd be nice to fix.

  _.each(routes, function (route) {
    var parsedUrl = url.parse(route.url, /* parseQueryString */ false,
                              /* slashesDenoteHost aka workRight */ true);
    if (parsedUrl.protocol || parsedUrl.port || parsedUrl.search)
      throw new Error("Bad url");
    parsedUrl.host = null;
    parsedUrl.path = null;
    if (! parsedUrl.hostname) {
      parsedUrl.hostname = proxyConfig.bindHost;
      if (! parsedUrl.pathname)
        parsedUrl.pathname = "";
      if (! parsedUrl.pathname.indexOf("/") !== 0) {
        // Relative path
        parsedUrl.pathname = bindPathPrefix + parsedUrl.pathname;
      }
    }
    var version = "";

    var AppConfig = Package["application-configuration"].AppConfig;
    version = AppConfig.getStarForThisJob() || "";


    var parsedDdpUrl = _.clone(parsedUrl);
    parsedDdpUrl.protocol = "ddp";
    // Node has a hardcoded list of protocols that get '://' instead
    // of ':'. ddp needs to be added to that whitelist. Until then, we
    // can set the undocumented attribute 'slashes' to get the right
    // behavior. It's not clear whether than is by design or accident.
    parsedDdpUrl.slashes = true;
    parsedDdpUrl.port = '' + securePort;
    var ddpUrl = url.format(parsedDdpUrl);

    var proxyToHost, proxyToPort, proxyToPathPrefix;
    if (! _.has(route, 'forwardTo')) {
      proxyToHost = ourHost;
      proxyToPort = ourPort;
      proxyToPathPrefix = parsedUrl.pathname;
    } else {
      var parsedFwdUrl = url.parse(route.forwardTo, false, true);
      if (! parsedFwdUrl.hostname || parsedFwdUrl.protocol)
        throw new Error("Bad forward url");
      proxyToHost = parsedFwdUrl.hostname;
      proxyToPort = parseInt(parsedFwdUrl.port || "80");
      proxyToPathPrefix = parsedFwdUrl.pathname || "";
    }

    if (route.ddp) {
      proxy.call('bindDdp', {
        pid: pid,
        bindTo: {
          ddpUrl: ddpUrl,
          insecurePort: insecurePort
        },
        proxyTo: {
          tags: [version],
          host: proxyToHost,
          port: proxyToPort,
          pathPrefix: proxyToPathPrefix + '/websocket'
        },
        requiresAuth: requiresDdpAuth
      }, makeCallback());
    }

    if (route.http) {
      proxy.call('bindHttp', {
        pid: pid,
        bindTo: {
          host: parsedUrl.hostname,
          port: insecurePort,
          pathPrefix: parsedUrl.pathname
        },
        proxyTo: {
          tags: [version],
          host: proxyToHost,
          port: proxyToPort,
          pathPrefix: proxyToPathPrefix
        },
        requiresAuth: requiresHttpAuth
      }, makeCallback());

      // Only make the secure binding if we've been told that the
      // proxy knows how terminate secure connections for us (has an
      // appropriate cert, can bind the necessary port..)
      if (proxyConfig.securePort !== null) {
        proxy.call('bindHttp', {
          pid: pid,
          bindTo: {
            host: parsedUrl.hostname,
            port: securePort,
            pathPrefix: parsedUrl.pathname,
            ssl: true
          },
          proxyTo: {
            tags: [version],
            host: proxyToHost,
            port: proxyToPort,
            pathPrefix: proxyToPathPrefix
          },
          requiresAuth: requiresHttpAuth
        }, makeCallback());
      }
    }
  });

  startedAll = true;
  checkComplete();
};

// (Internal, unsupported interface -- subject to change)
//
// Listen for HTTP and/or DDP traffic and route it somewhere. Only
// takes effect when using a proxy service.
//
// 'url' is the traffic that we want to route, interpreted relative to
// the default URL where this app has been told to serve itself. It
// may not have a scheme or port, but it may have a host and a path,
// and if no host is provided the path need not be absolute. The
// following cases are possible:
//
//   //somehost.com
//     All incoming traffic for 'somehost.com'
//   //somehost.com/foo/bar
//     All incoming traffic for 'somehost.com', but only when
//     the first two path components are 'foo' and 'bar'.
//   /foo/bar
//     Incoming traffic on our default host, but only when the
//     first two path components are 'foo' and 'bar'.
//   foo/bar
//     Incoming traffic on our default host, but only when the path
//     starts with our default path prefix, followed by 'foo' and
//     'bar'.
//
// (Yes, these scheme-less URLs that start with '//' are legal URLs.)
//
// You can select either DDP traffic, HTTP traffic, or both. Both
// secure and insecure traffic will be gathered (assuming the proxy
// service is capable, eg, has appropriate certs and port mappings).
//
// With no 'forwardTo' option, the traffic is received by this process
// for service by the hooks in this 'webapp' package. The original URL
// is preserved (that is, if you bind "/a", and a user visits "/a/b",
// the app receives a request with a path of "/a/b", not a path of
// "/b").
//
// With 'forwardTo', the process is instead sent to some other remote
// host. The URL is adjusted by stripping the path components in 'url'
// and putting the path components in the 'forwardTo' URL in their
// place. For example, if you forward "//somehost/a" to
// "//otherhost/x", and the user types "//somehost/a/b" into their
// browser, then otherhost will receive a request with a Host header
// of "somehost" and a path of "/x/b".
//
// The routing continues until this process exits. For now, all of the
// routes must be set up ahead of time, before the initial
// registration with the proxy. Calling addRoute from the top level of
// your JS should do the trick.
//
// When multiple routes are present that match a given request, the
// most specific route wins. When routes with equal specificity are
// present, the proxy service will distribute the traffic between
// them.
//
// options may be:
// - ddp: if true, the default, include DDP traffic. This includes
//   both secure and insecure traffic, and both websocket and sockjs
//   transports.
// - http: if true, the default, include HTTP/HTTPS traffic.
// - forwardTo: if provided, should be a URL with a host, optional
//   path and port, and no scheme (the scheme will be derived from the
//   traffic type; for now it will always be a http or ws connection,
//   never https or wss, but we could add a forwardSecure flag to
//   re-encrypt).
var routes = [];
WebAppInternals.addRoute = function (url, options) {
  options = _.extend({
    ddp: true,
    http: true
  }, options || {});

  if (proxy)
    // In the future, lift this restriction
    throw new Error("Too late to add routes");

  routes.push(_.extend({ url: url }, options));
};

// Receive traffic on our default URL.
WebAppInternals.addRoute("");

runWebAppServer();


var inlineScriptsAllowed = true;

WebAppInternals.inlineScriptsAllowed = function () {
  return inlineScriptsAllowed;
};

WebAppInternals.setInlineScriptsAllowed = function (value) {
  inlineScriptsAllowed = value;
};

WebAppInternals.setBundledJsCssPrefix = function (prefix) {
  bundledJsCssPrefix = prefix;
};
