////////// Requires //////////

var fs = Npm.require("fs");
var http = Npm.require("http");
var os = Npm.require("os");
var path = Npm.require("path");
var url = Npm.require("url");

var connect = Npm.require('connect');
var optimist = Npm.require('optimist');
var useragent = Npm.require('useragent');


var findGalaxy = _.once(function () {
  if (!('GALAXY' in process.env)) {
    console.log(
      "To do Meteor Galaxy operations like binding to a Galaxy " +
        "proxy, the GALAXY environment variable must be set.");
    process.exit(1);
  }

  return Meteor.connect(process.env['GALAXY']);
});

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
// As a temporary hack there is a `categorizeRequest` function on
// __meteor_bootstrap__ which converts a connect `req` to a Meteor
// `request`. This can go away once smart packages such as appcache are
// being passed a `request` object directly when they serve content.
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

var identifyBrowser = function (req) {
  var userAgent = useragent.lookup(req.headers['user-agent']);
  return {
    name: camelCase(userAgent.family),
    major: +userAgent.major,
    minor: +userAgent.minor,
    patch: +userAgent.patch
  };
};

var categorizeRequest = function (req) {
  return {
    browser: identifyBrowser(req),
    url: url.parse(req.url, true)
  };
};

var htmlAttributes = function (template, request) {
  var attributes = '';
  _.each(__meteor_bootstrap__.htmlAttributeHooks || [], function (hook) {
    var attribute = hook(request);
    if (attribute !== null && attribute !== undefined && attribute !== '')
      attributes += ' ' + attribute;
  });
  return template.replace('##HTML_ATTRIBUTES##', attributes);
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
  if (Meteor._routePolicy.classify(url))
    return false;

  // we currently return app HTML on all URLs by default
  return true;
};


Meteor._postStartup = function (callback) {
  __meteor_bootstrap__.postStartupHooks.push(callback);
};

var runWebAppServer = function () {
  // read the control for the client we'll be serving up
  var clientJsonPath = path.join(__meteor_bootstrap__.serverDir,
                                 __meteor_bootstrap__.configJson.client);
  var clientDir = path.dirname(clientJsonPath);
  var clientJson = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));

  if (clientJson.format !== "browser-program-pre1")
    throw new Error("Unsupported format for client assets: " +
                    JSON.stringify(clientJson.format));

  // XXX change all this config to something more reasonable
  var deployConfig =
        process.env.METEOR_DEPLOY_CONFIG
        ? JSON.parse(process.env.METEOR_DEPLOY_CONFIG) : {};
  if (!deployConfig.packages)
    deployConfig.packages = {};
  if (!deployConfig.boot)
    deployConfig.boot = {};
  if (!deployConfig.boot.bind)
    deployConfig.boot.bind = {};

  // check environment for legacy env variables.
  if (process.env.PORT && !_.has(deployConfig.boot.bind, 'localPort')) {
    deployConfig.boot.bind.localPort = parseInt(process.env.PORT);
  }
  if (process.env.MONGO_URL) {
    if (!deployConfig.packages['mongo-livedata'])
      deployConfig.packages['mongo-livedata'] = {};
    deployConfig.packages['mongo-livedata'].url = process.env.MONGO_URL;
  }

  // webserver
  var app = connect();

  // Strip off the path prefix, if it exists.
  app.use(function (request, response, next) {
    var pathPrefix = __meteor_runtime_config__.PATH_PREFIX;
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
  // Parse the query string into res.query. Only oauth_server cares about this,
  // but it's overkill to have that package depend on its own copy of connect
  // just for this simple processing.
  app.use(connect.query());
  // Hack: allow http tests to call connect.basicAuth without making them
  // Npm.depends on another copy of connect. (That would be fine if we could
  // have test-only NPM dependencies but is overkill here.)
  app.__basicAuth__ = connect.basicAuth;

  // Auto-compress any json, javascript, or text.
  app.use(connect.compress());

  if (clientJson.staticCacheable) {
    // cacheable files are files that should never change. Typically
    // named by their hash (eg meteor bundled js and css files).
    // cache them ~forever (1yr)
    app.use(connect.static(path.join(clientDir, clientJson.staticCacheable),
                           {maxAge: 1000 * 60 * 60 * 24 * 365}));
  }

  // cache non-cacheable file anyway. This isn't really correct, as
  // users can change the files and changes won't propogate
  // immediately. However, if we don't cache them, browsers will
  // 'flicker' when rerendering images. Eventually we will probably want
  // to rewrite URLs of static assets to include a query parameter to
  // bust caches. That way we can both get good caching behavior and
  // allow users to change assets without delay.
  // https://github.com/meteor/meteor/issues/773
  if (clientJson.static) {
    app.use(connect.static(path.join(clientDir, clientJson.static),
                           {maxAge: 1000 * 60 * 60 * 24}));
  }

  var httpServer = http.createServer(app);

  // start up app
  _.extend(__meteor_bootstrap__, {
    app: app,
    httpServer: httpServer,
    // metadata about this bundle
    // XXX this could use some refactoring to better distinguish
    // server and client
    bundle: {
      manifest: clientJson.manifest,
      root: clientDir
    },
    // function that takes a connect `req` object and returns a summary
    // object with information about the request. See
    // #BrowserIdentifcation
    categorizeRequest: categorizeRequest,
    // list of functions to be called to determine any attributes to be
    // added to the '<html>' tag. Each function is passed a 'request'
    // object (see #BrowserIdentifcation) and should return a string,
    htmlAttributeHooks: [],
    deployConfig: deployConfig
  });

  // Let the rest of the packages (and Meteor.startup hooks) insert connect
  // middlewares and update __meteor_runtime_config__, then keep going to set up
  // actually serving HTML.
  // @export main
  main = function (argv) {
    argv = optimist(argv).boolean('keepalive').argv;

    var boilerplateHtmlPath = path.join(clientDir, clientJson.page);
    var boilerplateHtml =
          fs.readFileSync(boilerplateHtmlPath, 'utf8').replace(
            "// ##RUNTIME_CONFIG##",
            "__meteor_runtime_config__ = " +
              JSON.stringify(__meteor_runtime_config__) + ";");


    boilerplateHtml = boilerplateHtml.replace(
        /##PATH_PREFIX##/g,
      __meteor_runtime_config__.PATH_PREFIX || ""
    );

    app.use(function (req, res, next) {
      if (! appUrl(req.url))
        return next();

      var request = categorizeRequest(req);

      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});

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

    // only start listening after all the startup code has run.
    var bind = deployConfig.boot.bind;
    httpServer.listen(bind.localPort || 0, Meteor.bindEnvironment(function() {
      if (argv.keepalive || true)
        console.log("LISTENING"); // must match run.js
      var port = httpServer.address().port;
      if (bind.viaProxy && bind.viaProxy.proxyEndpoint) {
        Meteor._bindToProxy(bind.viaProxy);
      } else if (bind.viaProxy) {
        // bind via the proxy, but we'll have to find it ourselves via
        // ultraworld.
        var galaxy = findGalaxy();
        galaxy.subscribe('servicesByName', 'proxy');
        var Proxies = new Meteor.Collection('services', {
          manager: galaxy
        });
        var doBinding = function (proxyService) {
          if (proxyService.providers.proxy) {
            Log("Attempting to bind to proxy at " + proxyService.providers.proxy);
            Meteor._bindToProxy(_.extend({
              proxyEndpoint: proxyService.providers.proxy
            }, bind.viaProxy));
          }
        };
        Proxies.find().observe({
          added: doBinding,
          changed: doBinding
        });
      }

      _.each(__meteor_bootstrap__.postStartupHooks, function (x) { x(); });

    }, function (e) {
      console.error("Error listening:", e);
      console.error(e.stack);
    }));

    if (argv.keepalive)
      initKeepalive();
    return 'DAEMON';
  };
};

Meteor._bindToProxy = function (proxyConfig) {

  var securePort = proxyConfig.securePort || 4433;
  var insecurePort = proxyConfig.insecurePort || 8080;
  var bindPathPrefix = proxyConfig.bindPathPrefix || "";
  // XXX also support galaxy-based lookup
  if (!proxyConfig.proxyEndpoint)
    throw new Error("missing proxyEndpoint");
  if (!proxyConfig.bindHost)
    throw new Error("missing bindHost");
  // XXX move these into deployConfig?
  if (!process.env.GALAXY_JOB)
    throw new Error("missing $GALAXY_JOB");
  if (!process.env.GALAXY_APP)
    throw new Error("missing $GALAXY_APP");
  if (!process.env.LAST_START)
    throw new Error("missing $LAST_START");

  // XXX rename pid argument to bindTo.
  var pid = {
    job: process.env.GALAXY_JOB,
    lastStarted: process.env.LAST_START,
    app: process.env.GALAXY_APP
  };
  var myHost = os.hostname();

  var ddpBindTo = {
    ddpUrl: 'ddp://' + proxyConfig.bindHost + ':' + securePort + bindPathPrefix + '/',
    insecurePort: insecurePort
  };

  // This is run after packages are loaded (in main) so we can use
  // Meteor.connect.
  var proxy = Meteor.connect(proxyConfig.proxyEndpoint);
  var route = process.env.ROUTE;
  var host = route.split(":")[0];
  var port = +route.split(":")[1];
  proxy.call('bindDdp', {
    pid: pid,
    bindTo: ddpBindTo,
    proxyTo: {
      host: host,
      port: port,
      pathPrefix: bindPathPrefix + '/websocket'
    }
  });
  proxy.call('bindHttp', {
    pid: pid,
    bindTo: {
      host: proxyConfig.bindHost,
      port: insecurePort,
      pathPrefix: bindPathPrefix
    },
    proxyTo: {
      host: host,
      port: port,
      pathPrefix: bindPathPrefix
    }
  });
  if (proxyConfig.securePort !== null) {
    proxy.call('bindHttp', {
      pid: pid,
      bindTo: {
        host: proxyConfig.bindHost,
        port: securePort,
        pathPrefix: bindPathPrefix,
        ssl: true
      },
      proxyTo: {
        host: host,
        port: port,
        pathPrefix: bindPathPrefix
      }
    });
  }
  Log("Bound to proxy");
};

runWebAppServer();
