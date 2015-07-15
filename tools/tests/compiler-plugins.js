var _ = require('underscore');
var selftest = require('../selftest.js');
var files = require('../files.js');
import { getUrl } from '../http-helpers.js';

var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

function startRun(sandbox) {
  var run = sandbox.run();
  run.match("myapp");
  run.match("proxy");
  run.tellMongo(MONGO_LISTENING);
  run.match("MongoDB");
  return run;
};

// Tests the actual cache logic used by coffeescript and less.
selftest.define("compiler plugin caching - coffee/less", function () {
  var s = new Sandbox({ fakeMongo: true });

  // Create an app that uses coffeescript and less.
  s.createApp("myapp", "coffee-and-less");
  s.cd("myapp");
  // Ask them to print out when they build a file (instead of using it from the
  // cache) as well as when they load cache from disk.
  s.set("METEOR_TEST_PRINT_CACHE_DEBUG", "t");
  var run = startRun(s);

  // First program built (server or web.browser) compiles everything.
  run.match('Ran coffee.compile (#1) on: ' + JSON.stringify(
    ['/f1.coffee', '/f2.coffee', '/f3.coffee', '/packages/local-pack/p.coffee']
  ));
  run.match('Ran less.render (#1) on: ' + JSON.stringify(
    ["/subdir/nested-root.main.less", "/top.main.less"]));
  // Second program doesn't need to compile anything because compilation works
  // the same on both programs.  (Note that there is no less.render execution in
  // the second program, because it has archMatching: 'web'.  We'll see this
  // more clearly when the next call later is "#2" --- we didn't miss a call!)
  run.match("Ran coffee.compile (#2) on: []");
  // App prints this:
  run.match("Coffeescript X is 2 Y is 1 FromPackage is 4");

  // Check that the CSS is what we expect.
  var checkCSS = selftest.markStack(function (borderStyleMap) {
    var builtBrowserProgramDir = files.pathJoin(
      s.cwd, '.meteor', 'local', 'build', 'programs', 'web.browser');
    var cssFile = _.find(
      files.readdir(
        files.pathJoin(s.cwd, '.meteor/local/build/programs/web.browser')),
      function (path) {
        return path.match(/\.css$/);
      }
    );
    selftest.expectTrue(cssFile);
    var actual = s.read(
      files.pathJoin('.meteor/local/build/programs/web.browser', cssFile));
    actual = actual.replace(/\s+/g, ' ');  // simplify whitespace
    var expected = _.map(borderStyleMap, function (style, className) {
      return '.' + className + " { border-style: " + style + "; }";
    }).join(' ');
    selftest.expectEqual(actual, expected);
  });
  var expectedBorderStyles = {
    el0: "dashed", el1: "dotted", el2: "solid", el3: "groove", el4: "ridge"};
  checkCSS(expectedBorderStyles);

  s.write("f2.coffee", "share.Y = 'Y is 3'\n");
  // Only recompiles f2.
  run.match('Ran coffee.compile (#3) on: ["/f2.coffee"]');
  run.match('Ran less.render (#2) on: []');
  // And other program doesn't even need to do f2.
  run.match("Ran coffee.compile (#4) on: []");
  // Program prints this:
  run.match("Coffeescript X is 2 Y is 3 FromPackage is 4");

  // Force a rebuild of the local package without actually changing the
  // coffeescript file in it. This should not require us to coffee.compile
  // anything (for either program).
  s.append("packages/local-pack/package.js", "\n// foo\n");
  run.match("Ran coffee.compile (#5) on: []");
  run.match('Ran less.render (#3) on: []');
  run.match("Ran coffee.compile (#6) on: []");
  run.match("Coffeescript X is 2 Y is 3 FromPackage is 4");

  // But writing to the actual source file in the local package should
  // recompile.
  s.write("packages/local-pack/p.coffee", "FromPackage = 'FromPackage is 5'");
  run.match('Ran coffee.compile (#7) on: ["/packages/local-pack/p.coffee"]');
  run.match('Ran less.render (#4) on: []');
  run.match('Ran coffee.compile (#8) on: []');
  run.match("Coffeescript X is 2 Y is 3 FromPackage is 5");

  // Writing to a single less file only re-renders the root that depends on it.
  s.write('packages/local-pack/p.less', '@el4-style: inset;\n');
  expectedBorderStyles.el4 = 'inset';
  run.match('Ran coffee.compile (#9) on: []');
  run.match('Ran less.render (#5) on: ["/top.main.less"]');
  // Note that since this was a client-only change, we're smart enough to not
  // rebuild the server at all.  So the next coffee.compile will be #10.
  run.match("Client modified -- refreshing");
  checkCSS(expectedBorderStyles);

  // This works for changing a root too.
  s.write('subdir/nested-root.main.less', '.el0 { border-style: double; }\n');
  expectedBorderStyles.el0 = 'double';
  // Only #10, not #11, because client-only changes don't rebuild the server!
  run.match('Ran coffee.compile (#10) on: []');
  run.match('Ran less.render (#6) on: ["/subdir/nested-root.main.less"]');
  run.match("Client modified -- refreshing");
  checkCSS(expectedBorderStyles);

  // Adding a new root works too.
  s.write('yet-another-root.main.less', '.el6 { border-style: solid; }\n');
  expectedBorderStyles.el6 = 'solid';
  run.match('Ran coffee.compile (#11) on: []');
  run.match('Ran less.render (#7) on: ["/yet-another-root.main.less"]');
  run.match("Client modified -- refreshing");
  checkCSS(expectedBorderStyles);

  // We never should have loaded cache from disk, since we only made
  // each compiler once and there was no cache.json at this point.
  run.forbid('Loaded coffeescript cache');
  run.forbid('Loaded less cache');

  // Kill the run. Change one coffee file and one less file and re-run.
  run.stop();
  s.write("f2.coffee", "share.Y = 'Y is edited'\n");
  s.write('packages/local-pack/p.less', '@el4-style: double;\n');
  expectedBorderStyles.el4 = 'double';
  run = startRun(s);

  // This time there's a cache to load!
  run.match('Loaded coffeescript cache');
  run.match('Loaded less cache');
  // And we only need to re-compiler the changed file, even though we restarted.
  run.match('Ran coffee.compile (#1) on: ["/f2.coffee"]');
  run.match('Ran less.render (#1) on: ["/top.main.less"]');
  run.match('Ran coffee.compile (#2) on: []');

  run.match('Coffeescript X is 2 Y is edited FromPackage is 5');
  checkCSS(expectedBorderStyles);

  s.write('bad-import.main.less', '@import "/foo/bad.less";\n');
  run.match('Errors prevented startup');
  run.match('bad-import.main.less:1: Unknown import: /foo/bad.less');
  run.match('Waiting for file change');

  run.stop();
});

// Tests that rebuilding a compiler plugin re-instantiates the source processor,
// but other changes don't.
selftest.define("compiler plugin caching - local plugin", function () {
  var s = new Sandbox({ fakeMongo: true });

  s.createApp("myapp", "local-compiler-plugin");
  s.cd("myapp");

  var run = startRun(s);

  // The compiler gets used the first time...
  run.match("PrintmeCompiler invocation 1");
  // ... and the program runs the generated code.
  run.match("PMC: Print out bar");
  run.match("PMC: Print out foo");

  s.write("quux.printme", "And print out quux");
  // PrintmeCompiler gets reused.
  run.match("PrintmeCompiler invocation 2");
  // And the right output prints out
  run.match("PMC: Print out bar");
  run.match("PMC: Print out foo");
  run.match("PMC: And print out quux");

  // Restart meteor; see that the disk cache gets used.
  run.stop();
  run = startRun(s);
  // Disk cache gets us up to 3.
  run.match("PrintmeCompiler invocation 3");
  // And the right output prints out
  run.match("PMC: Print out bar");
  run.match("PMC: Print out foo");
  run.match("PMC: And print out quux");

  // Edit the compiler itself.
  s.write('packages/local-plugin/plugin.js',
          s.read('packages/local-plugin/plugin.js').replace(/PMC/, 'pmc'));
  // New PrintmeCompiler object, and empty disk cache dir.
  run.match("PrintmeCompiler invocation 1");
  // And the right output prints out (lower case now)
  run.match("pmc: Print out bar");
  run.match("pmc: Print out foo");
  run.match("pmc: And print out quux");

  run.stop();
});

// Test error on duplicate compiler plugins.
selftest.define("compiler plugins - duplicate extension", () => {
  const s = new Sandbox({ fakeMongo: true });

  s.createApp("myapp", "duplicate-compiler-extensions");
  s.cd("myapp");

  let run = startRun(s);
  run.match('Errors prevented startup');
  run.match('conflict: two packages');
  run.match('trying to handle *.myext');

  // Fix it by changing one extension.
  s.write('packages/local-plugin/plugin.js',
          s.read('packages/local-plugin/plugin.js').replace('myext', 'xext'));
  run.match('Modified -- restarting');

  run.stop();
});

// Test error when a source file no longer has an active plugin.
selftest.define("compiler plugins - inactive source", () => {
  const s = new Sandbox({ fakeMongo: true });

  // This app depends on the published package 'glasser:uses-sourcish', and
  // contains a local package 'local-plugin'.
  //
  // glasser:uses-sourcish depends on local-plugin and contains a file
  // 'foo.sourcish'. When glasser:uses-sourcish@0.0.1 was published, a local
  // copy of 'local-plugin' had a plugin which called registerCompiler for the
  // extension '*.sourcish', and so 'foo.sourcish' is in the published isopack
  // as a source file. However, the copy of 'local-plugin' currently in the test
  // app contains no plugins. So we hit this weird error.
  s.createApp('myapp', 'uses-published-package-with-inactive-source');
  s.cd('myapp');

  let run = startRun(s);
  run.match('Errors prevented startup');
  run.match('no plugin found for foo.sourcish in glasser:use-sourcish');
  run.match('none is now');

  run.stop();
});

// Test error when the registerCompiler callback throws.
selftest.define("compiler plugins - compiler throws", () => {
  const s = new Sandbox({ fakeMongo: true });

  s.createApp('myapp', 'compiler-plugin-throws-on-instantiate');
  s.cd('myapp');

  const run = s.run('add', 'local-plugin');
  run.matchErr('Errors while adding packages');
  run.matchErr(
    'While running registerCompiler callback in package local-plugin');
  // XXX This is wrong! The path on disk is packages/local-plugin/plugin.js, but
  // at some point we switched to the servePath which is based on the *plugin*'s
  // "package" name.
  run.matchErr('packages/compilePrintme/plugin.js:5:1: Error in my ' +
               'registerCompiler callback!');
  run.expectExit(1);
});

// Test that compiler plugins can add static assets.
selftest.define("compiler plugins - compiler addAsset", () => {
  const s = new Sandbox({ fakeMongo: true });

  s.createApp('myapp', 'compiler-plugin-add-asset');
  s.cd('myapp');

  const run = startRun(s);
  // Test server-side asset.
  run.match("Asset says Print out foo");

  // Test client-side asset.
  const body = getUrl('http://localhost:3000/foo.printme');
  selftest.expectEqual(body, 'Print out foo\n');

  run.stop();
});
