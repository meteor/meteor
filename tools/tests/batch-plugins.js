var selftest = require('../selftest.js');

var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };


// Tests the actual cache logic used by coffeescript and less.
selftest.define("coffeescript and less caching", function () {
  var s = new Sandbox({ fakeMongo: true });

  // Create an app that uses coffeescript and less.
  s.createApp("myapp", "coffee-and-less");
  s.cd("myapp");
  // Ask them to print out when they build a file (instead of using it from the
  // cache).
  s.set("METEOR_TEST_PRINT_ON_CACHE_MISS", "t");
  var run = s.run();
  run.match("myapp");
  run.match("proxy");
  run.tellMongo(MONGO_LISTENING);
  run.match("MongoDB");

  // First program built (server or web.browser) compiles everything.
  run.match(
    "Ran coffee.compile on: [ '/f1.coffee', '/f2.coffee', '/f3.coffee' ]");
  // Second program doesn't need to compile anything because compilation works
  // the same on both programs.


  // App prints this:
  run.match("Coffeescript X is 2 Y is 1");

  s.write("f2.coffee", "share.Y = 'Y is 3'\n");
  // Only recompiles f2.
  run.match("Ran coffee.compile on: [ '/f2.coffee' ]");
  // And other program doesn't even need to do that.
  run.match("Ran coffee.compile on: []");
  // Program prints this:
  run.match("Coffeescript X is 2 Y is 3");

  // XXX BBP test less too

  run.stop();
});

// XXX BBP test that modifying a local plugin works
