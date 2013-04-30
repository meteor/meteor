////////// Requires //////////

var Fiber = require("fibers");

var fs = require("fs");
var os = require("os");
var path = require("path");
var url = require("url");

var connect = require('connect');
var gzippo = require('gzippo');
var argv = require('optimist').argv;
var useragent = require('useragent');

var _ = require('underscore');

// This code is duplicated in tools/server/server.js.
var MIN_NODE_VERSION = 'v0.8.18';
if (require('semver').lt(process.version, MIN_NODE_VERSION)) {
  process.stderr.write(
    'Meteor requires Node ' + MIN_NODE_VERSION + ' or later.\n');
  process.exit(1);
}

// Keepalives so that when the outer server dies unceremoniously and
// doesn't kill us, we quit ourselves. A little gross, but better than
// pidfiles.
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
  if (__meteor_bootstrap__._routePolicy &&
      __meteor_bootstrap__._routePolicy.classify(url))
    return false;

  // we currently return app HTML on all URLs by default
  return true;
}

var run = function () {
  var serverDir = __dirname;

  // read our control files
  var serverJson =
    JSON.parse(fs.readFileSync(path.join(serverDir, process.argv[2]), 'utf8'));

  var configJson =
    JSON.parse(fs.readFileSync(path.join(serverDir, 'config.json'), 'utf8'));

  // read the control for the client we'll be serving up
  var clientJsonPath = path.join(serverDir, configJson.client);
  var clientDir = path.dirname(clientJsonPath);
  var clientJson = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));

  if (clientJson.format !== "browser-program-pre1")
    throw new Error("Unsupported format for client assets: " +
                    JSON.stringify(clientJson.format));

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
  // XXX make outer wrapper fail if MONGO_URL not set
  if (process.env.MONGO_URL) {
    if (!deployConfig.packages['mongo-livedata'])
      deployConfig.packages['mongo-livedata'] = {};
    deployConfig.packages['mongo-livedata'].url = process.env.MONGO_URL;
  }

  // webserver
  var app = connect.createServer();

  var staticCacheablePath = path.join(clientDir, clientJson.staticCacheable);
  if (staticCacheablePath)
    // cacheable files are files that should never change. Typically
    // named by their hash (eg meteor bundled js and css files).
    // cache them ~forever (1yr)
    //
    // 'root' option is to work around an issue in connect/gzippo.
    // See https://github.com/meteor/meteor/pull/852
    app.use(gzippo.staticGzip(staticCacheablePath,
                              {clientMaxAge: 1000 * 60 * 60 * 24 * 365,
                               root: '/'}));

  // cache non-cacheable file anyway. This isn't really correct, as
  // users can change the files and changes won't propogate
  // immediately. However, if we don't cache them, browsers will
  // 'flicker' when rerendering images. Eventually we will probably want
  // to rewrite URLs of static assets to include a query parameter to
  // bust caches. That way we can both get good caching behavior and
  // allow users to change assets without delay.
  // https://github.com/meteor/meteor/issues/773
  var staticPath = path.join(clientDir, clientJson.static);
  if (staticPath)
    app.use(gzippo.staticGzip(staticPath,
                              {clientMaxAge: 1000 * 60 * 60 * 24,
                               root: '/'}));

  // start up app
  __meteor_bootstrap__ = {
    app: app,
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
    // functions to be called after all packages are loaded and we are
    // ready to serve HTTP.
    startup_hooks: [],
    deployConfig: deployConfig
  };

  __meteor_runtime_config__ = {};
  if (configJson.release) {
    __meteor_runtime_config__.meteorRelease = configJson.release;
  }

  Fiber(function () {
    // (put in a fiber to let Meteor.db operations happen during loading)

    // load app code
    _.each(serverJson.load, function (fileInfo) {
      var code = fs.readFileSync(path.join(serverDir, fileInfo.path));

      var Npm = {
        // require an npm module used by your package, or one from the
        // dev bundle if you are in an app or your package isn't using
        // said npm module
        require: function (name) {
          if (! fileInfo.node_modules) {
            // current no support for npm outside packages. load from
            // dev bundle only
            return require(name);
          }

          var nodeModuleDir =
            path.join(__dirname, fileInfo.node_modules, name);

          if (fs.existsSync(nodeModuleDir)) {
            return require(nodeModuleDir);
          }
          try {
            return require(name);
          } catch (e) {
            // Try to guess the package name so we can print a nice
            // error message
            var filePathParts = fileInfo.path.split(path.sep);
            var packageName = filePathParts[2].replace(/\.js$/, '');

            // XXX better message
            throw new Error(
              "Can't find npm module '" + name +
                "'. Did you forget to call 'Npm.depends' in package.js " +
                "within the '" + packageName + "' package?");
          }
        }
      };
      // \n is necessary in case final line is a //-comment
      var wrapped = "(function(Npm){" + code + "\n})";

      // it's tempting to run the code in a new context so we can
      // precisely control the enviroment the user code sees. but,
      // this is harder than it looks. you get a situation where []
      // created in one runInContext invocation fails 'instanceof
      // Array' if tested in another (reusing the same context each
      // time fixes it for {} and Object, but not [] and Array.) and
      // we have no pressing need to do this, so punt.
      //
      // the final 'true' is an undocumented argument to
      // runIn[Foo]Context that causes it to print out a descriptive
      // error message on parse error. it's what require() uses to
      // generate its errors.
      var func = require('vm').runInThisContext(wrapped, fileInfo.path, true);
      // Setting `this` to `global` allows you to do a top-level
      // "this.foo = " to define global variables when using "use strict"
      // (http://es5.github.io/#x15.3.4.4); this is the only way to do
      // it in CoffeeScript.
      func.call(global, Npm);
    });


    // Actually serve HTML. This happens after user code, so that
    // packages can insert connect middlewares and update
    // __meteor_runtime_config__
    var boilerplateHtmlPath = path.join(clientDir, clientJson.page);
    var boilerplateHtml =
      fs.readFileSync(boilerplateHtmlPath, 'utf8').replace(
        "// ##RUNTIME_CONFIG##",
        "__meteor_runtime_config__ = " +
          JSON.stringify(__meteor_runtime_config__) + ";");

    app.use(function (req, res, next) {
      if (! appUrl(req.url))
        return next();

      var request = categorizeRequest(req);

      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});

      var requestSpecificHtml = htmlAttributes(boilerplateHtml, request);
      res.write(requestSpecificHtml);
      res.end();
    });

    // Return 404 by default, if no other handlers serve this URL.
    app.use(function (req, res) {
      res.writeHead(404);
      res.end();
    });

    // run the user startup hooks.
    _.each(__meteor_bootstrap__.startup_hooks, function (x) { x(); });

    // only start listening after all the startup code has run.
    var bind = deployConfig.boot.bind;
    app.listen(bind.localPort || 0, function() {
      if (argv.keepalive)
        console.log("LISTENING"); // must match run.js
      var port = app.address().port;
      if (bind.viaProxy) {
        Fiber(function () {
          bindToProxy(port, bind.viaProxy);
        }).run();
      }
    });

  }).run();

  if (argv.keepalive)
    initKeepalive();
};

var bindToProxy = function (localPort, proxyConfig) {
  // XXX also support galaxy-based lookup
  if (!proxyConfig.proxyEndpoint)
    throw new Error("missing proxyEndpoint");
  if (!proxyConfig.bindHost)
    throw new Error("missing bindHost");

  var pid = 'pid-is-ignored';
  var myHost = os.hostname();

  var ddpBindTo = proxyConfig.unprivilegedPorts ? {
    ddpUrl: 'ddp://' + proxyConfig.bindHost + ':8080/',
    securePort: 4433
  } : {
    ddpUrl: 'ddp://' + proxyConfig.bindHost + '/'
  };

  var proxy = Package.meteor.Meteor.connect(proxyConfig.proxyEndpoint);
  proxy.call('bindDdp', {
    pid: pid,
    bindTo: ddpBindTo,
    proxyTo: {
      host: myHost,
      port: localPort,
      pathPrefix: '/websocket'
    }
  });
  proxy.call('bindHttp', {
    pid: pid,
    bindTo: {
      host: proxyConfig.bindHost,
      port: proxyConfig.unprivilegedPorts ? 8080 : 80
    },
    proxyTo: {
      host: myHost,
      port: localPort
    }
  });
  proxy.call('bindHttp', {
    pid: pid,
    bindTo: {
      host: proxyConfig.bindHost,
      port: proxyConfig.unprivilegedPorts ? 4433: 443,
      ssl: true
    },
    proxyTo: {
      host: myHost,
      port: localPort
    }
  });
};

run();
