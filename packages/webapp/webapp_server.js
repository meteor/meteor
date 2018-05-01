import assert from "assert";
import { readFile } from "fs";
import { createServer } from "http";
import {
  join as pathJoin,
  dirname as pathDirname,
} from "path";
import { parse as parseUrl } from "url";
import { createHash } from "crypto";
import { connect } from "./connect.js";
import compress from "compression";
import cookieParser from "cookie-parser";
import query from "qs-middleware";
import parseRequest from "parseurl";
import basicAuth from "basic-auth-connect";
import { lookup as lookupUserAgent } from "useragent";
import { isModern } from "meteor/modern-browsers";
import send from "send";
import {
  removeExistingSocketFile,
  registerSocketFileCleanup,
} from './socket_file.js';

var SHORT_SOCKET_TIMEOUT = 5*1000;
var LONG_SOCKET_TIMEOUT = 120*1000;

export const WebApp = {};
export const WebAppInternals = {};

const hasOwn = Object.prototype.hasOwnProperty;

// backwards compat to 2.0 of connect
connect.basicAuth = basicAuth;

WebAppInternals.NpmModules = {
  connect: {
    version: Npm.require('connect/package.json').version,
    module: connect,
  }
};

// Though we might prefer to use web.browser (modern) as the default
// architecture, safety requires a more compatible defaultArch.
WebApp.defaultArch = 'web.browser.legacy';

// XXX maps archs to manifests
WebApp.clientPrograms = {};

// XXX maps archs to program path on filesystem
var archPath = {};

var bundledJsCssUrlRewriteHook = function (url) {
  var bundledPrefix =
     __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '';
  return bundledPrefix + url;
};

var sha1 = function (contents) {
  var hash = createHash('sha1');
  hash.update(contents);
  return hash.digest('hex');
};

var readUtf8FileSync = function (filename) {
  return Meteor.wrapAsync(readFile)(filename, 'utf8');
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
  var userAgent = lookupUserAgent(userAgentString);
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
  return _.extend({
    browser: identifyBrowser(req.headers['user-agent']),
    url: parseUrl(req.url, true)
  }, _.pick(req, 'dynamicHead', 'dynamicBody', 'headers', 'cookies'));
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
  // XXX Apparently in Node 0.12 this event was called 'prefinish'.
  // https://github.com/joyent/node/commit/7c9b6070
  // But it has switched back to 'finish' in Node v4:
  // https://github.com/nodejs/node/pull/1411
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

// Register a callback function that can selectively modify boilerplate
// data given arguments (request, data, arch). The key should be a unique
// identifier, to prevent accumulating duplicate callbacks from the same
// call site over time. Callbacks will be called in the order they were
// registered. A callback should return false if it did not make any
// changes affecting the boilerplate. Passing null deletes the callback.
// Any previous callback registered for this key will be returned.
const boilerplateDataCallbacks = Object.create(null);
WebAppInternals.registerBoilerplateDataCallback = function (key, callback) {
  const previousCallback = boilerplateDataCallbacks[key];

  if (typeof callback === "function") {
    boilerplateDataCallbacks[key] = callback;
  } else {
    assert.strictEqual(callback, null);
    delete boilerplateDataCallbacks[key];
  }

  // Return the previous callback in case the new callback needs to call
  // it; for example, when the new callback is a wrapper for the old.
  return previousCallback || null;
};

// Given a request (as returned from `categorizeRequest`), return the
// boilerplate HTML to serve for that request.
//
// If a previous connect middleware has rendered content for the head or body,
// returns the boilerplate with that content patched in otherwise
// memoizes on HTML attributes (used by, eg, appcache) and whether inline
// scripts are currently allowed.
// XXX so far this function is always called with arch === 'web.browser'
function getBoilerplate(request, arch) {
  return getBoilerplateAsync(request, arch).await();
}

function getBoilerplateAsync(request, arch) {
  const boilerplate = boilerplateByArch[arch];
  const data = Object.assign({}, boilerplate.baseData, {
    htmlAttributes: getHtmlAttributes(request),
  }, _.pick(request, "dynamicHead", "dynamicBody"));

  let madeChanges = false;
  let promise = Promise.resolve();

  Object.keys(boilerplateDataCallbacks).forEach(key => {
    promise = promise.then(() => {
      const callback = boilerplateDataCallbacks[key];
      return callback(request, data, arch);
    }).then(result => {
      // Callbacks should return false if they did not make any changes.
      if (result !== false) {
        madeChanges = true;
      }
    });
  });

  return promise.then(() => ({
    stream: boilerplate.toHTMLStream(data),
    statusCode: data.statusCode,
    headers: data.headers,
  }));
}

WebAppInternals.generateBoilerplateInstance = function (arch,
                                                        manifest,
                                                        additionalOptions) {
  additionalOptions = additionalOptions || {};

  var runtimeConfig = _.extend(
    _.clone(__meteor_runtime_config__),
    additionalOptions.runtimeConfigOverrides || {}
  );

  return new Boilerplate(arch, manifest, _.extend({
    pathMapper(itemPath) {
      return pathJoin(archPath[arch], itemPath);
    },
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
      bundledJsCssUrlRewriteHook: bundledJsCssUrlRewriteHook,
      inlineScriptsAllowed: WebAppInternals.inlineScriptsAllowed(),
      inline: additionalOptions.inline
    }
  }, additionalOptions));
};

// A mapping from url path to architecture (e.g. "web.browser") to static
// file information with the following fields:
// - type: the type of file to be served
// - cacheable: optionally, whether the file should be cached or not
// - sourceMapUrl: optionally, the url of the source map
//
// Info also contains one of the following:
// - content: the stringified content that should be served at this path
// - absolutePath: the absolute path on disk to the file

var staticFilesByArch;

// Serve static files from the manifest or added with
// `addStaticJs`. Exported for tests.
WebAppInternals.staticFilesMiddleware = function (staticFilesByArch, req, res, next) {
  if ('GET' != req.method && 'HEAD' != req.method && 'OPTIONS' != req.method) {
    next();
    return;
  }
  var pathname = parseRequest(req).pathname;
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

  const info = getStaticFileInfo(
    pathname,
    identifyBrowser(req.headers["user-agent"]),
  );

  if (! info) {
    next();
    return;
  }

  // We don't need to call pause because, unlike 'static', once we call into
  // 'send' and yield to the event loop, we never call another handler with
  // 'next'.

  // Cacheable files are files that should never change. Typically
  // named by their hash (eg meteor bundled js and css files).
  // We cache them ~forever (1yr).
  const maxAge = info.cacheable
    ? 1000 * 60 * 60 * 24 * 365
    : 0;

  if (info.cacheable) {
    // Since we use req.headers["user-agent"] to determine whether the
    // client should receive modern or legacy resources, tell the client
    // to invalidate cached resources when/if its user agent string
    // changes in the future.
    res.setHeader("Vary", "User-Agent");
  }

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

  if (info.type === "js" ||
      info.type === "dynamic js") {
    res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
  } else if (info.type === "css") {
    res.setHeader("Content-Type", "text/css; charset=UTF-8");
  } else if (info.type === "json") {
    res.setHeader("Content-Type", "application/json; charset=UTF-8");
  }

  if (info.hash) {
    res.setHeader('ETag', '"' + info.hash + '"');
  }

  if (info.content) {
    res.write(info.content);
    res.end();
  } else {
    send(req, info.absolutePath, {
      maxage: maxAge,
      dotfiles: 'allow', // if we specified a dotfile in the manifest, serve it
      lastModified: false // don't set last-modified based on the file date
    }).on('error', function (err) {
      Log.error("Error serving static file " + err);
      res.writeHead(500);
      res.end();
    }).on('directory', function () {
      Log.error("Unexpected directory " + info.absolutePath);
      res.writeHead(500);
      res.end();
    }).pipe(res);
  }
};

function getStaticFileInfo(originalPath, browser) {
  const { arch, path } = getArchAndPath(originalPath, browser);

  if (! hasOwn.call(WebApp.clientPrograms, arch)) {
    return null;
  }

  if (hasOwn.call(staticFilesByArch, arch)) {
    const staticFiles = staticFilesByArch[arch];

    // If staticFiles contains originalPath with the arch inferred above,
    // use that information.
    if (hasOwn.call(staticFiles, originalPath)) {
      return staticFiles[originalPath];
    }

    // If getArchAndPath returned an alternate path, try that instead.
    if (path !== originalPath &&
        hasOwn.call(staticFiles, path)) {
      return staticFiles[path];
    }
  }

  return null;
}

function getArchAndPath(path, browser) {
  const pathParts = path.split("/");
  const archKey = pathParts[1];

  if (archKey.startsWith("__")) {
    const archCleaned = "web." + archKey.slice(2);
    if (hasOwn.call(WebApp.clientPrograms, archCleaned)) {
      pathParts.splice(1, 1); // Remove the archKey part.
      return {
        arch: archCleaned,
        path: pathParts.join("/"),
      };
    }
  }

  // TODO Perhaps one day we could infer Cordova clients here, so that we
  // wouldn't have to use prefixed "/__cordova/..." URLs.
  const arch = isModern(browser)
    ? "web.browser"
    : "web.browser.legacy";

  if (hasOwn.call(WebApp.clientPrograms, arch)) {
    return { arch, path };
  }

  return {
    arch: WebApp.defaultArch,
    path,
  };
}

// Parse the passed in port value. Return the port as-is if it's a String
// (e.g. a Windows Server style named pipe), otherwise return the port as an
// integer.
//
// DEPRECATED: Direct use of this function is not recommended; it is no
// longer used internally, and will be removed in a future release.
WebAppInternals.parsePort = port => {
  let parsedPort = parseInt(port);
  if (Number.isNaN(parsedPort)) {
    parsedPort = port;
  }
  return parsedPort;
}

function runWebAppServer() {
  var shuttingDown = false;
  var syncQueue = new Meteor._SynchronousQueue();

  var getItemPathname = function (itemUrl) {
    return decodeURIComponent(parseUrl(itemUrl).pathname);
  };

  WebAppInternals.reloadClientPrograms = function () {
    syncQueue.runTask(function() {
      staticFilesByArch = Object.create(null);

      function generateClientProgram(clientPath, arch) {
        function addStaticFile(path, item) {
          if (! hasOwn.call(staticFilesByArch, arch)) {
            staticFilesByArch[arch] = Object.create(null);
          }
          staticFilesByArch[arch][path] = item;
        }

        // read the control for the client we'll be serving up
        var clientJsonPath = pathJoin(__meteor_bootstrap__.serverDir,
                                   clientPath);
        var clientDir = pathDirname(clientJsonPath);
        var clientJson = JSON.parse(readUtf8FileSync(clientJsonPath));
        if (clientJson.format !== "web-program-pre1")
          throw new Error("Unsupported format for client assets: " +
                          JSON.stringify(clientJson.format));

        if (! clientJsonPath || ! clientDir || ! clientJson)
          throw new Error("Client config file not parsed.");

        var manifest = clientJson.manifest;
        _.each(manifest, function (item) {
          if (item.url && item.where === "client") {
            addStaticFile(getItemPathname(item.url), {
              absolutePath: pathJoin(clientDir, item.path),
              cacheable: item.cacheable,
              hash: item.hash,
              // Link from source to its map
              sourceMapUrl: item.sourceMapUrl,
              type: item.type
            });

            if (item.sourceMap) {
              // Serve the source map too, under the specified URL. We assume all
              // source maps are cacheable.
              addStaticFile(getItemPathname(item.sourceMapUrl), {
                absolutePath: pathJoin(clientDir, item.sourceMap),
                cacheable: true
              });
            }
          }
        });

        var program = {
          format: "web-program-pre1",
          manifest: manifest,
          version: process.env.AUTOUPDATE_VERSION ||
            WebAppHashing.calculateClientHash(
              manifest,
              null,
              _.pick(__meteor_runtime_config__, "PUBLIC_SETTINGS")
            ),
          cordovaCompatibilityVersions: clientJson.cordovaCompatibilityVersions,
          PUBLIC_SETTINGS: __meteor_runtime_config__.PUBLIC_SETTINGS
        };

        WebApp.clientPrograms[arch] = program;

        // Expose program details as a string reachable via the following
        // URL.
        const manifestUrlPrefix = "/__" + arch.replace(/^web\./, "");
        const manifestUrl = manifestUrlPrefix +
          getItemPathname("/manifest.json");

        addStaticFile(manifestUrl, {
          content: JSON.stringify(program),
          cacheable: false,
          hash: program.version,
          type: "json"
        });
      }

      try {
        var clientPaths = __meteor_bootstrap__.configJson.clientPaths;
        _.each(clientPaths, function (clientPath, arch) {
          archPath[arch] = pathDirname(clientPath);
          generateClientProgram(clientPath, arch);
        });

        // Exported for tests.
        WebAppInternals.staticFilesByArch = staticFilesByArch;
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
      },

      "web.browser": {
        runtimeConfigOverrides: {
          isModern: true,
        }
      },

      "web.browser.legacy": {
        runtimeConfigOverrides: {
          isModern: false,
        }
      },
    };

    syncQueue.runTask(function() {
      const allCss = [];

      _.each(WebApp.clientPrograms, function (program, archName) {
        boilerplateByArch[archName] =
          WebAppInternals.generateBoilerplateInstance(
            archName,
            program.manifest,
            defaultOptionsForArch[archName],
          );

        const cssFiles = boilerplateByArch[archName].baseData.css;
        cssFiles.forEach(file => allCss.push({
          url: bundledJsCssUrlRewriteHook(file.url),
        }));
      });

      // Clear the memoized boilerplate cache.
      memoizedBoilerplate = {};

      WebAppInternals.refreshableAssets = { allCss };
    });
  };

  WebAppInternals.reloadClientPrograms();

  // webserver
  var app = connect();

  // Packages and apps can add handlers that run before any other Meteor
  // handlers via WebApp.rawConnectHandlers.
  var rawConnectHandlers = connect();
  app.use(rawConnectHandlers);

  // Auto-compress any json, javascript, or text.
  app.use(compress());

  // parse cookies into an object
  app.use(cookieParser());

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
  app.use(query());

  // Serve static files from the manifest.
  // This is inspired by the 'static' middleware.
  app.use(function (req, res, next) {
    WebAppInternals.staticFilesMiddleware(staticFilesByArch, req, res, next);
  });

  // Core Meteor packages like dynamic-import can add handlers before
  // other handlers added by package and application code.
  app.use(WebAppInternals.meteorInternalHandlers = connect());

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
    if (! appUrl(req.url)) {
      return next();

    } else {
      var headers = {
        'Content-Type': 'text/html; charset=utf-8'
      };

      if (shuttingDown) {
        headers['Connection'] = 'Close';
      }

      var request = WebApp.categorizeRequest(req);

      if (request.url.query && request.url.query['meteor_css_resource']) {
        // In this case, we're requesting a CSS resource in the meteor-specific
        // way, but we don't have it.  Serve a static css file that indicates that
        // we didn't have it, so we can detect that and refresh.  Make sure
        // that any proxies or CDNs don't cache this error!  (Normally proxies
        // or CDNs are smart enough not to cache error pages, but in order to
        // make this hack work, we need to return the CSS file as a 200, which
        // would otherwise be cached.)
        headers['Content-Type'] = 'text/css; charset=utf-8';
        headers['Cache-Control'] = 'no-cache';
        res.writeHead(200, headers);
        res.write(".meteor-css-not-found-error { width: 0px;}");
        res.end();
        return;
      }

      if (request.url.query && request.url.query['meteor_js_resource']) {
        // Similarly, we're requesting a JS resource that we don't have.
        // Serve an uncached 404. (We can't use the same hack we use for CSS,
        // because actually acting on that hack requires us to have the JS
        // already!)
        headers['Cache-Control'] = 'no-cache';
        res.writeHead(404, headers);
        res.end("404 Not Found");
        return;
      }

      if (request.url.query && request.url.query['meteor_dont_serve_index']) {
        // When downloading files during a Cordova hot code push, we need
        // to detect if a file is not available instead of inadvertently
        // downloading the default index page.
        // So similar to the situation above, we serve an uncached 404.
        headers['Cache-Control'] = 'no-cache';
        res.writeHead(404, headers);
        res.end("404 Not Found");
        return;
      }

      return getBoilerplateAsync(
        request,
        getArchAndPath(
          parseRequest(req).pathname,
          request.browser,
        ).arch,
      ).then(({ stream, statusCode, headers: newHeaders }) => {
        if (!statusCode) {
          statusCode = res.statusCode ? res.statusCode : 200;
        }

        if (newHeaders) {
          Object.assign(headers, newHeaders);
        }

        res.writeHead(statusCode, headers);

        stream.pipe(res, {
          // End the response when the stream ends.
          end: true,
        });

      }).catch(error => {
        Log.error("Error running template: " + error.stack);
        res.writeHead(500, headers);
        res.end();
      });
    }
  });

  // Return 404 by default, if no other handlers serve this URL.
  app.use(function (req, res) {
    res.writeHead(404);
    res.end();
  });


  var httpServer = createServer(app);
  var onListeningCallbacks = [];

  // After 5 seconds w/o data on a socket, kill it.  On the other hand, if
  // there's an outstanding request, give it a higher timeout instead (to avoid
  // killing long-polling requests)
  httpServer.setTimeout(SHORT_SOCKET_TIMEOUT);

  // Do this here, and then also in livedata/stream_server.js, because
  // stream_server.js kills all the current request handlers when installing its
  // own.
  httpServer.on('request', WebApp._timeoutAdjustmentRequestCallback);

  // If the client gave us a bad request, tell it instead of just closing the
  // socket. This lets load balancers in front of us differentiate between "a
  // server is randomly closing sockets for no reason" and "client sent a bad
  // request".
  //
  // This will only work on Node 6; Node 4 destroys the socket before calling
  // this event. See https://github.com/nodejs/node/pull/4557/ for details.
  httpServer.on('clientError', (err, socket) => {
    // Pre-Node-6, do nothing.
    if (socket.destroyed) {
      return;
    }

    if (err.message === 'Parse Error') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    } else {
      // For other errors, use the default behavior as if we had no clientError
      // handler.
      socket.destroy(err);
    }
  });

  // start up app
  _.extend(WebApp, {
    connectHandlers: packageAndAppHandlers,
    rawConnectHandlers: rawConnectHandlers,
    httpServer: httpServer,
    connectApp: app,
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
    // This can be overridden by users who want to modify how listening works
    // (eg, to run a proxy like Apollo Engine Proxy in front of the server).
    startListening: function (httpServer, listenOptions, cb) {
      httpServer.listen(listenOptions, cb);
    },
  });

  // Let the rest of the packages (and Meteor.startup hooks) insert connect
  // middlewares and update __meteor_runtime_config__, then keep going to set up
  // actually serving HTML.
  exports.main = argv => {
    WebAppInternals.generateBoilerplate();

    const startHttpServer = listenOptions => {
      WebApp.startListening(httpServer, listenOptions, Meteor.bindEnvironment(() => {
        if (process.env.METEOR_PRINT_ON_LISTEN) {
          console.log("LISTENING");
        }
        const callbacks = onListeningCallbacks;
        onListeningCallbacks = null;
        callbacks.forEach(callback => { callback(); });
      }, e => {
        console.error("Error listening:", e);
        console.error(e && e.stack);
      }));
    };

    let localPort = process.env.PORT || 0;
    const unixSocketPath = process.env.UNIX_SOCKET_PATH;

    if (unixSocketPath) {
      // Start the HTTP server using a socket file.
      removeExistingSocketFile(unixSocketPath);
      startHttpServer({ path: unixSocketPath });
      registerSocketFileCleanup(unixSocketPath);
    } else {
      localPort = isNaN(Number(localPort)) ? localPort : Number(localPort);
      if (/\\\\?.+\\pipe\\?.+/.test(localPort)) {
        // Start the HTTP server using Windows Server style named pipe.
        startHttpServer({ path: localPort });
      } else if (typeof localPort === "number") {
        // Start the HTTP server using TCP.
        startHttpServer({
          port: localPort,
          host: process.env.BIND_IP || "0.0.0.0"
        });
      } else {
        throw new Error("Invalid PORT specified");
      }
    }

    return "DAEMON";
  };
}


runWebAppServer();


var inlineScriptsAllowed = true;

WebAppInternals.inlineScriptsAllowed = function () {
  return inlineScriptsAllowed;
};

WebAppInternals.setInlineScriptsAllowed = function (value) {
  inlineScriptsAllowed = value;
  WebAppInternals.generateBoilerplate();
};


WebAppInternals.setBundledJsCssUrlRewriteHook = function (hookFn) {
  bundledJsCssUrlRewriteHook = hookFn;
  WebAppInternals.generateBoilerplate();
};

WebAppInternals.setBundledJsCssPrefix = function (prefix) {
  var self = this;
  self.setBundledJsCssUrlRewriteHook(
    function (url) {
      return prefix + url;
  });
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
