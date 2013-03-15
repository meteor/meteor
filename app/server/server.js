////////// Requires //////////

var Fiber = require("fibers");

var fs = require("fs");
var path = require("path");
var url = require("url");

var connect = require('connect');
var gzippo = require('gzippo');
var argv = require('optimist').argv;
var useragent = require('useragent');

var _ = require('underscore');

// This code is duplicated in app/server/server.js.
var MIN_NODE_VERSION = 'v0.8.18';
if (require('semver').lt(process.version, MIN_NODE_VERSION)) {
  process.stderr.write(
    'Meteor requires Node ' + MIN_NODE_VERSION + ' or later.\n');
  process.exit(1);
}

// Keepalives so that when the outer server dies unceremoniously and
// doesn't kill us, we quit ourselves. A little gross, but better than
// pidfiles.
var init_keepalive = function () {
  var keepalive_count = 0;

  process.stdin.on('data', function (data) {
    keepalive_count = 0;
  });

  process.stdin.resume();

  setInterval(function () {
    keepalive_count ++;
    if (keepalive_count >= 3) {
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

var supported_browser = function (browser) {
  return true;

  // For now, we don't actually deny anyone. The unsupported browser
  // page isn't very good.
  //
  // return !(browser.family === 'IE' && browser.major <= 5);
};




// add any runtime configuration options needed to app_html
var runtime_config = function (app_html) {
  var insert = '';
  if (typeof __meteor_runtime_config__ === 'undefined')
    return app_html;

  app_html = app_html.replace(
    "// ##RUNTIME_CONFIG##",
    "__meteor_runtime_config__ = " +
      JSON.stringify(__meteor_runtime_config__) + ";");

  return app_html;
};

var htmlAttributes = function (app_html, request) {
  var attributes = '';
  _.each(__meteor_bootstrap__.htmlAttributeHooks || [], function (hook) {
    var attribute = hook(request);
    if (attribute !== null && attribute !== undefined && attribute !== '')
      attributes += ' ' + attribute;
  });
  return app_html.replace('##HTML_ATTRIBUTES##', attributes);
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
  var bundle_dir = path.join(__dirname, '..');

  // check environment
  var port = process.env.PORT ? parseInt(process.env.PORT) : 80;

  // check for a valid MongoDB URL right away
  if (!process.env.MONGO_URL)
    throw new Error("MONGO_URL must be set in environment");

  // webserver
  var app = connect.createServer();
  var static_cacheable_path = path.join(bundle_dir, 'static_cacheable');
  if (fs.existsSync(static_cacheable_path))
    // cacheable files are files that should never change. Typically
    // named by their hash (eg meteor bundled js and css files).
    // cache them ~forever (1yr)
    app.use(gzippo.staticGzip(static_cacheable_path,
                              {clientMaxAge: 1000 * 60 * 60 * 24 * 365}));
  // cache non-cacheable file anyway. This isn't really correct, as
  // users can change the files and changes won't propogate
  // immediately. However, if we don't cache them, browsers will
  // 'flicker' when rerendering images. Eventually we will probably want
  // to rewrite URLs of static assets to include a query parameter to
  // bust caches. That way we can both get good caching behavior and
  // allow users to change assets without delay.
  // https://github.com/meteor/meteor/issues/773
  app.use(gzippo.staticGzip(path.join(bundle_dir, 'static'),
                            {clientMaxAge: 1000 * 60 * 60 * 24}));

  // read bundle config file
  var info_raw =
    fs.readFileSync(path.join(bundle_dir, 'app.json'), 'utf8');
  var info = JSON.parse(info_raw);
  var bundle = {manifest: info.manifest, root: bundle_dir};

  // start up app

  __meteor_bootstrap__ = {
    // connect middleware
    app: app,
    // metadata about this bundle
    bundle: bundle,
    // function that takes a connect `req` object and returns a summary
    // object with information about the request. See
    // #BrowserIdentifcation
    categorizeRequest: categorizeRequest,
    // list of functions to be called to determine any attributes to be
    // added to the '<html>' tag. Each function is passed a 'request'
    // object (see #BrowserIdentifcation) and should return a string,
    htmlAttributeHooks: [],
    // Node.js 'require' object.
    require: require,
    // functions to be called after all packages are loaded and we are
    // ready to serve HTTP.
    startup_hooks: []
  };

  __meteor_runtime_config__ = {};

  Fiber(function () {
    // (put in a fiber to let Meteor.db operations happen during loading)

    // load app code
    _.each(info.load, function (filename) {
      var code = fs.readFileSync(path.join(bundle_dir, filename));
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
      require('vm').runInThisContext(code, filename, true);
    });


    // Actually serve HTML. This happens after user code, so that
    // packages can insert connect middlewares and update
    // __meteor_runtime_config__
    var app_html = fs.readFileSync(path.join(bundle_dir, 'app.html'), 'utf8');
    var unsupported_html = fs.readFileSync(path.join(bundle_dir, 'unsupported.html'));

    app_html = runtime_config(app_html);

    app.use(function (req, res, next) {
      if (! appUrl(req.url))
        return next();

      var request = categorizeRequest(req);

      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});

      if (! supported_browser(request.browser)) {
        res.write(unsupported_html);
        res.end();
        return;
      }

      var requestSpecificHtml = htmlAttributes(app_html, request);
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
    app.listen(port, function() {
      if (argv.keepalive)
        console.log("LISTENING"); // must match run.js
    });

  }).run();

  if (argv.keepalive)
    init_keepalive();
};

run();
