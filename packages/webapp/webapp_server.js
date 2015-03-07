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

var Future = Npm.require('fibers/future');
var Fiber = Npm.require('fibers');

var SHORT_SOCKET_TIMEOUT = 5*1000;
var LONG_SOCKET_TIMEOUT = 120*1000;

WebApp = {};
WebAppInternals = {};

WebAppInternals.NpmModules = {
  connect: {
    version: Npm.require('connect/package.json').version,
    module: connect
  }
};

WebApp.defaultArch = 'web.browser';

// XXX maps archs to manifests
WebApp.clientPrograms = {};

// XXX maps archs to program path on filesystem
var archPath = {};

var bundledJsCssPrefix;

var sha1 = function (contents) {
  var hash = crypto.createHash('sha1');
  hash.update(contents);
  return hash.digest('hex');
};

var readUtf8FileSync = function (filename) {
  return Meteor.wrapAsync(fs.readFile)(filename, 'utf8');
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
// #BrowserIdentification) and should return null or object.
var htmlAttributeHooks = [];
var getHtmlAttributes = function (request) {
  var combinedAttributes  = {};
  _.each(htmlAttributeHooks || [], function (hook) {
    var attributes = hook(request);
    if (attributes === null)
      return;
    if (typeof attributes !== 'object')
      throw Error("HTML attribute hook must return null or object");
    _.extend(combinedAttributes, attributes);
  });
  return combinedAttributes;
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
  var calculateClientHash = WebAppHashing.calculateClientHash;
  WebApp.clientHash = function (archName) {
    archName = archName || WebApp.defaultArch;
    return calculateClientHash(WebApp.clientPrograms[archName].manifest);
  };

  WebApp.calculateClientHashRefreshable = function (archName) {
    archName = archName || WebApp.defaultArch;
    return calculateClientHash(WebApp.clientPrograms[archName].manifest,
      function (name) {
        return name === "css";
      });
  };
  WebApp.calculateClientHashNonRefreshable = function (archName) {
    archName = archName || WebApp.defaultArch;
    return calculateClientHash(WebApp.clientPrograms[archName].manifest,
      function (name) {
        return name !== "css";
      });
  };
  WebApp.calculateClientHashCordova = function () {
    var archName = 'web.cordova';
    if (! WebApp.clientPrograms[archName])
      return 'none';

    return calculateClientHash(
      WebApp.clientPrograms[archName].manifest, null, _.pick(
        __meteor_runtime_config__, 'PUBLIC_SETTINGS'));
  };
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


// Will be updated by main before we listen.
// Map from client arch to boilerplate object.
// Boilerplate object has:
//   - func: XXX
//   - baseData: XXX
var boilerplateByArch = {};

// Given a request (as returned from `categorizeRequest`), return the
// boilerplate HTML to serve for that request. Memoizes on HTML
// attributes (used by, eg, appcache) and whether inline scripts are
// currently allowed.
// XXX so far this function is always called with arch === 'web.browser'
var memoizedBoilerplate = {};
var getBoilerplate = function (request, arch) {

  var htmlAttributes = getHtmlAttributes(request);

  // The only thing that changes from request to request (for now) are
  // the HTML attributes (used by, eg, appcache) and whether inline
  // scripts are allowed, so we can memoize based on that.
  var memHash = JSON.stringify({
    inlineScriptsAllowed: inlineScriptsAllowed,
    htmlAttributes: htmlAttributes,
    arch: arch
  });

  if (! memoizedBoilerplate[memHash]) {
    memoizedBoilerplate[memHash] = boilerplateByArch[arch].toHTML({
      htmlAttributes: htmlAttributes
    });
  }
  return memoizedBoilerplate[memHash];
};

WebAppInternals.generateBoilerplateInstance = function (arch,
                                                        manifest,
                                                        additionalOptions) {
  additionalOptions = additionalOptions || {};

  var runtimeConfig = _.extend(
    _.clone(__meteor_runtime_config__),
    additionalOptions.runtimeConfigOverrides || {}
  );

  var jsCssPrefix;
  if (arch === 'web.cordova') {
    // in cordova we serve assets up directly from disk so it doesn't make
    // sense to use the prefix (ordinarily something like a CDN) and go out
    // to the internet for those files.
    jsCssPrefix = '';
  } else {
    jsCssPrefix = bundledJsCssPrefix ||
      __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '';
  }

  return new Boilerplate(arch, manifest,
    _.extend({
      pathMapper: function (itemPath) {
        return path.join(archPath[arch], itemPath); },
      baseDataExtension: {
        additionalStaticJs: _.map(
          additionalStaticJs || [],
          function (contents, pathname) {
            return {
              pathname: pathname,
              contents: contents
            };
          }
        ),
        // Convert to a JSON string, then get rid of most weird characters, then
        // wrap in double quotes. (The outermost JSON.stringify really ought to
        // just be "wrap in double quotes" but we use it to be safe.) This might
        // end up inside a <script> tag so we need to be careful to not include
        // "</script>", but normal {{spacebars}} escaping escapes too much! See
        // https://github.com/meteor/meteor/issues/3730
        meteorRuntimeConfig: JSON.stringify(
          encodeURIComponent(JSON.stringify(runtimeConfig))),
        rootUrlPathPrefix: __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '',
        bundledJsCssPrefix: jsCssPrefix,
        inlineScriptsAllowed: WebAppInternals.inlineScriptsAllowed(),
        inline: additionalOptions.inline
      }
    }, additionalOptions)
  );
};

// A mapping from url path to "info". Where "info" has the following fields:
// - type: the type of file to be served
// - cacheable: optionally, whether the file should be cached or not
// - sourceMapUrl: optionally, the url of the source map
//
// Info also contains one of the following:
// - content: the stringified content that should be served at this path
// - absolutePath: the absolute path on disk to the file

var staticFiles;

// Serve static files from the manifest or added with
// `addStaticJs`. Exported for tests.
WebAppInternals.staticFilesMiddleware = function (staticFiles, req, res, next) {
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
    res.writeHead(200, {
      'Content-type': 'application/javascript; charset=UTF-8'
    });
    res.write(s);
    res.end();
  };

  if (pathname === "/meteor_runtime_config.js" &&
      ! WebAppInternals.inlineScriptsAllowed()) {
    serveStaticJs("__meteor_runtime_config__ = " +
                  JSON.stringify(__meteor_runtime_config__) + ";");
    return;
  } else if (_.has(additionalStaticJs, pathname) &&
              ! WebAppInternals.inlineScriptsAllowed()) {
    serveStaticJs(additionalStaticJs[pathname]);
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

  // Set the X-SourceMap header, which current Chrome, FireFox, and Safari
  // understand.  (The SourceMap header is slightly more spec-correct but FF
  // doesn't understand it.)
  //
  // You may also need to enable source maps in Chrome: open dev tools, click
  // the gear in the bottom right corner, and select "enable source maps".
  if (info.sourceMapUrl) {
    res.setHeader('X-SourceMap',
                  __meteor_runtime_config__.ROOT_URL_PATH_PREFIX +
                  info.sourceMapUrl);
  }

  if (info.type === "js") {
    res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
  } else if (info.type === "css") {
    res.setHeader("Content-Type", "text/css; charset=UTF-8");
  } else if (info.type === "json") {
    res.setHeader("Content-Type", "application/json; charset=UTF-8");
    // XXX if it is a manifest we are serving, set additional headers
    if (/\/manifest.json$/.test(pathname)) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
  }

  if (info.content) {
    res.write(info.content);
    res.end();
  } else {
    send(req, info.absolutePath)
      .maxage(maxAge)
      .hidden(true)  // if we specified a dotfile in the manifest, serve it
      .on('error', function (err) {
        Log.error("Error serving static file " + err);
        res.writeHead(500);
        res.end();
      })
      .on('directory', function () {
        Log.error("Unexpected directory " + info.absolutePath);
        res.writeHead(500);
        res.end();
      })
      .pipe(res);
  }
};

var getUrlPrefixForArch = function (arch) {
  // XXX we rely on the fact that arch names don't contain slashes
  // in that case we would need to uri escape it

  // We add '__' to the beginning of non-standard archs to "scope" the url
  // to Meteor internals.
  return arch === WebApp.defaultArch ?
    '' : '/' + '__' + arch.replace(/^web\./, '');
};

var runWebAppServer = function () {
  var shuttingDown = false;
  var syncQueue = new Meteor._SynchronousQueue();

  var getItemPathname = function (itemUrl) {
    return decodeURIComponent(url.parse(itemUrl).pathname);
  };

  WebAppInternals.reloadClientPrograms = function () {
    syncQueue.runTask(function() {
      staticFiles = {};
      var generateClientProgram = function (clientPath, arch) {
        // read the control for the client we'll be serving up
        var clientJsonPath = path.join(__meteor_bootstrap__.serverDir,
                                   clientPath);
        var clientDir = path.dirname(clientJsonPath);
        var clientJson = JSON.parse(readUtf8FileSync(clientJsonPath));
        if (clientJson.format !== "web-program-pre1")
          throw new Error("Unsupported format for client assets: " +
                          JSON.stringify(clientJson.format));

        if (! clientJsonPath || ! clientDir || ! clientJson)
          throw new Error("Client config file not parsed.");

        var urlPrefix = getUrlPrefixForArch(arch);

        var manifest = clientJson.manifest;
        _.each(manifest, function (item) {
          if (item.url && item.where === "client") {
            staticFiles[urlPrefix + getItemPathname(item.url)] = {
              absolutePath: path.join(clientDir, item.path),
              cacheable: item.cacheable,
              // Link from source to its map
              sourceMapUrl: item.sourceMapUrl,
              type: item.type
            };

            if (item.sourceMap) {
              // Serve the source map too, under the specified URL. We assume all
              // source maps are cacheable.
              staticFiles[urlPrefix + getItemPathname(item.sourceMapUrl)] = {
                absolutePath: path.join(clientDir, item.sourceMap),
                cacheable: true
              };
            }
          }
        });

        var program = {
          manifest: manifest,
          version: WebAppHashing.calculateClientHash(manifest, null, _.pick(
            __meteor_runtime_config__, 'PUBLIC_SETTINGS')),
          PUBLIC_SETTINGS: __meteor_runtime_config__.PUBLIC_SETTINGS
        };

        WebApp.clientPrograms[arch] = program;

        // Serve the program as a string at /foo/<arch>/manifest.json
        // XXX change manifest.json -> program.json
        staticFiles[path.join(urlPrefix, 'manifest.json')] = {
          content: JSON.stringify(program),
          cacheable: true,
          type: "json"
        };
      };

      try {
        var clientPaths = __meteor_bootstrap__.configJson.clientPaths;
        _.each(clientPaths, function (clientPath, arch) {
          archPath[arch] = path.dirname(clientPath);
          generateClientProgram(clientPath, arch);
        });

        // Exported for tests.
        WebAppInternals.staticFiles = staticFiles;
      } catch (e) {
        Log.error("Error reloading the client program: " + e.stack);
        process.exit(1);
      }
    });
  };

  WebAppInternals.generateBoilerplate = function () {
    // This boilerplate will be served to the mobile devices when used with
    // Meteor/Cordova for the Hot-Code Push and since the file will be served by
    // the device's server, it is important to set the DDP url to the actual
    // Meteor server accepting DDP connections and not the device's file server.
    var defaultOptionsForArch = {
      'web.cordova': {
        runtimeConfigOverrides: {
          // XXX We use absoluteUrl() here so that we serve https://
          // URLs to cordova clients if force-ssl is in use. If we were
          // to use __meteor_runtime_config__.ROOT_URL instead of
          // absoluteUrl(), then Cordova clients would immediately get a
          // HCP setting their DDP_DEFAULT_CONNECTION_URL to
          // http://example.meteor.com. This breaks the app, because
          // force-ssl doesn't serve CORS headers on 302
          // redirects. (Plus it's undesirable to have clients
          // connecting to http://example.meteor.com when force-ssl is
          // in use.)
          DDP_DEFAULT_CONNECTION_URL: process.env.MOBILE_DDP_URL ||
            Meteor.absoluteUrl(),
          ROOT_URL: process.env.MOBILE_ROOT_URL ||
            Meteor.absoluteUrl()
        }
      }
    };

    syncQueue.runTask(function() {
      _.each(WebApp.clientPrograms, function (program, archName) {
        boilerplateByArch[archName] =
          WebAppInternals.generateBoilerplateInstance(
            archName, program.manifest,
            defaultOptionsForArch[archName]);
      });

      // Clear the memoized boilerplate cache.
      memoizedBoilerplate = {};

      // Configure CSS injection for the default arch
      // XXX implement the CSS injection for all archs?
      WebAppInternals.refreshableAssets = {
        allCss: boilerplateByArch[WebApp.defaultArch].baseData.css
      };
    });
  };

  WebAppInternals.reloadClientPrograms();

  // webserver
  var app = connect();

  // Auto-compress any json, javascript, or text.
  app.use(connect.compress());

  // Packages and apps can add handlers that run before any other Meteor
  // handlers via WebApp.rawConnectHandlers.
  var rawConnectHandlers = connect();
  app.use(rawConnectHandlers);

  // We're not a proxy; reject (without crashing) attempts to treat us like
  // one. (See #1212.)
  app.use(function(req, res, next) {
    if (RoutePolicy.isValidUrl(req.url)) {
      next();
      return;
    }
    res.writeHead(400);
    res.write("Not a proxy");
    res.end();
  });

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

  // Serve static files from the manifest.
  // This is inspired by the 'static' middleware.
  app.use(function (req, res, next) {
    Fiber(function () {
     WebAppInternals.staticFilesMiddleware(staticFiles, req, res, next);
    }).run();
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

  app.use(function (req, res, next) {
    if (! appUrl(req.url))
      return next();

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

    // /packages/asdfsad ... /__cordova/dafsdf.js
    var pathname = connect.utils.parseUrl(req).pathname;
    var archKey = pathname.split('/')[1];
    var archKeyCleaned = 'web.' + archKey.replace(/^__/, '');

    if (! /^__/.test(archKey) || ! _.has(archPath, archKeyCleaned)) {
      archKey = WebApp.defaultArch;
    } else {
      archKey = archKeyCleaned;
    }

    var boilerplate;
    try {
      boilerplate = getBoilerplate(request, archKey);
    } catch (e) {
      Log.error("Error running template: " + e);
      res.writeHead(500, headers);
      res.end();
      return undefined;
    }

    res.writeHead(200, headers);
    res.write(boilerplate);
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


  // start up app
  _.extend(WebApp, {
    connectHandlers: packageAndAppHandlers,
    rawConnectHandlers: rawConnectHandlers,
    httpServer: httpServer,
    // For testing.
    suppressConnectErrors: function () {
      suppressConnectErrors = true;
    },
    onListening: function (f) {
      if (onListeningCallbacks)
        onListeningCallbacks.push(f);
      else
        f();
    }
  });

  // Let the rest of the packages (and Meteor.startup hooks) insert connect
  // middlewares and update __meteor_runtime_config__, then keep going to set up
  // actually serving HTML.
  main = function (argv) {
    WebAppInternals.generateBoilerplate();

    // only start listening after all the startup code has run.
    var localPort = parseInt(process.env.PORT) || 0;
    var host = process.env.BIND_IP;
    var localIp = host || '0.0.0.0';
    httpServer.listen(localPort, localIp, Meteor.bindEnvironment(function() {
      if (process.env.METEOR_PRINT_ON_LISTEN)
        console.log("LISTENING"); // must match run-app.js

      var callbacks = onListeningCallbacks;
      onListeningCallbacks = null;
      _.each(callbacks, function (x) { x(); });

    }, function (e) {
      console.error("Error listening:", e);
      console.error(e && e.stack);
    }));

    return 'DAEMON';
  };
};


runWebAppServer();


var inlineScriptsAllowed = true;

WebAppInternals.inlineScriptsAllowed = function () {
  return inlineScriptsAllowed;
};

WebAppInternals.setInlineScriptsAllowed = function (value) {
  inlineScriptsAllowed = value;
  WebAppInternals.generateBoilerplate();
};

WebAppInternals.setBundledJsCssPrefix = function (prefix) {
  bundledJsCssPrefix = prefix;
  WebAppInternals.generateBoilerplate();
};

// Packages can call `WebAppInternals.addStaticJs` to specify static
// JavaScript to be included in the app. This static JS will be inlined,
// unless inline scripts have been disabled, in which case it will be
// served under `/<sha1 of contents>`.
var additionalStaticJs = {};
WebAppInternals.addStaticJs = function (contents) {
  additionalStaticJs["/" + sha1(contents) + ".js"] = contents;
};

// Exported for tests
WebAppInternals.getBoilerplate = getBoilerplate;
WebAppInternals.additionalStaticJs = additionalStaticJs;
