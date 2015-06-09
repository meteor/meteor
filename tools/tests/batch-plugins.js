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
  run.match('Ran coffee.compile on: ' + JSON.stringify(
    ['/f1.coffee', '/f2.coffee', '/f3.coffee', '/packages/local-pack/p.coffee']
  ));
  // Second program doesn't need to compile anything because compilation works
  // the same on both programs.
  run.match("Ran coffee.compile on: []");

  // App prints this:
  run.match("Coffeescript X is 2 Y is 1 FromPackage is 4");

  s.write("f2.coffee", "share.Y = 'Y is 3'\n");
  // Only recompiles f2.
  run.match('Ran coffee.compile on: ["/f2.coffee"]');
  // And other program doesn't even need to do that.
  run.match("Ran coffee.compile on: []");
  // Program prints this:
  run.match("Coffeescript X is 2 Y is 3 FromPackage is 4");

  // Force a rebuild of the local package without actually changing the
  // coffeescript file in it. This should not require us to coffee.compile
  // anything (for either program).
  s.append("packages/local-pack/package.js", "\n// foo\n");
  run.match("Ran coffee.compile on: []");
  run.match("Ran coffee.compile on: []");

  // But writing to the actual source file in the local package should
  // recompile.
  s.write("packages/local-pack/p.coffee", "FromPackage = 'FromPackage is 5'");
  run.match('Ran coffee.compile on: ["/packages/local-pack/p.coffee"]');
  run.match('Ran coffee.compile on: []');

  // XXX BBP test less too

  run.stop();
});

// XXX BBP test that modifying a local plugin works
