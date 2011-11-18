////////// Requires //////////

require("fibers");

var fs = require("fs");
var path = require("path");

var connect = require('connect');
var gzip = require('connect-gzip');
var argv = require('optimist').argv;
var mime = require('mime');
var socketio = require('socket.io');
var handlebars = require('handlebars');

// this is a copy of underscore that will be shipped just for use by
// this file, server.js.
var _ = require('./underscore.js');

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
    if (keepalive_count >= 2) {
      console.log("Failed to receive keepalive! Exiting.");
      process.exit(1);
    }
  }, 3000);
};

var run = function (bundle_dir) {
  var bundle_dir = path.join(__dirname, '..');

  // check environment
  var port = process.env.PORT ? parseInt(process.env.PORT) : 80;
  var mongo_url = process.env.MONGO_URL;
  if (!mongo_url)
    throw new Error("MONGO_URL must be set in environment");

  // webserver
  var app = connect.createServer();
  app.use(gzip.gzip());
  app.use(connect.static(path.join(bundle_dir, 'static')));
  var app_html = fs.readFileSync(path.join(bundle_dir, 'app.html'));
  app.use(function (req, res) {
    res.write(app_html);
    res.end();
  });

  // socket.io setup
  var io = socketio.listen(app);
  io.configure(function() {
    // Don't serve static files from socket.io. We serve them separately
    // to get gzip and other fun things.
    io.set('browser client', false);

    io.set('log level', 1);
    // XXX disable websockets! they break chrome both debugging
    // and node-http-proxy (used in outer app)
    io.set('transports', _.without(io.transports(), 'websocket'));
  });

  // read bundle config file
  var info_raw =
    fs.readFileSync(path.join(bundle_dir, 'app.json'), 'utf8');
  var info = JSON.parse(info_raw);

  // start up app
  __skybreak_bootstrap__ = {require: require, startup_hooks: []};
  Fiber(function () {
    // (put in a fiber to let Sky.db operations happen during loading)

    // pass in database info
    __skybreak_bootstrap__.mongo_url = mongo_url;

    // load app code
    info.load.forEach(function (filename) {
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

    // connect socket.io to skybreak server libraries
    io.sockets.on('connection', function (socket) {
      __skybreak_bootstrap__.register_socket(socket);

      socket.on('subscribe', function (data) {
        __skybreak_bootstrap__.register_subscription(socket, data);
      });
      socket.on('unsubscribe', function (data) {
        __skybreak_bootstrap__.unregister_subscription(socket, data);
      });

      socket.on('handle', function (data) {
        __skybreak_bootstrap__.run_handler(socket, data,
                                                   io.sockets.sockets);
      });
    });

    // run the user startup hooks.
    _.each(__skybreak_bootstrap__.startup_hooks, function (x) { x(); });

    // only start listening after all the startup code has run.
    app.listen(port, function() {});

  }).run();

  init_keepalive();
};

run();
