////////// Requires //////////

require("fibers");

var fs = require("fs");
var path = require("path");

var connect = require('connect');
var gzippo = require('gzippo');
var argv = require('optimist').argv;
var mime = require('mime');
var handlebars = require('handlebars');
var useragent = require('useragent');

var _ = require('underscore');

// This code is duplicated in app/server/server.js.
var MIN_NODE_VERSION = 'v0.8.11';
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

var supported_browser = function (user_agent) {
  return true;

  // For now, we don't actually deny anyone. The unsupported browser
  // page isn't very good.
  //
  // var agent = useragent.lookup(user_agent);
  // return !(agent.family === 'IE' && +agent.major <= 5);
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
    app.use(gzippo.staticGzip(static_cacheable_path, {clientMaxAge: 1000 * 60 * 60 * 24 * 365}));
  app.use(gzippo.staticGzip(path.join(bundle_dir, 'static')));

  // read bundle config file
  var info_raw =
    fs.readFileSync(path.join(bundle_dir, 'app.json'), 'utf8');
  var info = JSON.parse(info_raw);

  // start up app
  __meteor_bootstrap__ = {require: require, startup_hooks: [], app: app};
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

    app.use(function (req, res) {
      // prevent favicon.ico and robots.txt from returning app_html
      if (_.indexOf([path.sep + 'favicon.ico', path.sep + 'robots.txt'], req.url) !== -1) {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      if (supported_browser(req.headers['user-agent']))
        res.write(app_html);
      else
        res.write(unsupported_html);
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
