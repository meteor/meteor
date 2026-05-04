var selftest = require('../tool-testing/selftest.js');

var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

async function startRun(sandbox) {
  var run = sandbox.run();
  await run.match("myapp");
  run.matchBeforeExit("Started proxy");
  await run.tellMongo(MONGO_LISTENING);
  run.matchBeforeExit("Started MongoDB");
  run.waitSecs(15);
  return run;
}

// Tests that rebuilding a compiler plugin re-instantiates the source processor,
// but other changes don't.
selftest.define("compiler plugin caching - local plugin", async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp("myapp", "local-compiler-plugin");
  s.cd("myapp");

  var run = await startRun(s);

  // The compiler gets used the first time...
  await run.match("PrintmeCompiler invocation 1");
  // ... and the program runs the generated code.
  await run.match("PMC: Print out bar");
  await run.match("PMC: Print out foo");

  s.write("quux.printme", "And print out quux");
  // PrintmeCompiler gets reused.
  await run.match("PrintmeCompiler invocation 2");
  // And the right output prints out
  await run.match("PMC: Print out bar");
  await run.match("PMC: Print out foo");
  await run.match("PMC: And print out quux");

  // Restart meteor; see that the disk cache gets used.
  await run.stop();
  run = await startRun(s);
  // Disk cache gets us up to 3.
  await run.match("PrintmeCompiler invocation 3");
  // And the right output prints out
  await run.match("PMC: Print out bar");
  await run.match("PMC: Print out foo");
  await run.match("PMC: And print out quux");

  // Edit the compiler itself.
  s.write('packages/local-plugin/plugin.js',
          s.read('packages/local-plugin/plugin.js').replace(/PMC/, 'pmc'));
  // New PrintmeCompiler object, and empty disk cache dir.
  await run.match("PrintmeCompiler invocation 1");
  // And the right output prints out (lower case now)
  await run.match("pmc: Print out bar");
  await run.match("pmc: Print out foo");
  await run.match("pmc: And print out quux");

  await run.stop();
});

// Tests that SwcCompiler properly applies SWC compilation on JS files
selftest.define("compiler plugin caching - local plugin with SwcCompiler", async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  process.env.METEOR_DISABLE_COLORS = true;

  // Create a new app based on local-compiler-plugin
  await s.createApp("myapp", "local-compiler-plugin");
  s.cd("myapp");

  // Create a JavaScript file to test SWC compilation
  s.write("test.js", "const message = 'Hello from SWC'; console.log(message);");

  // Modify the local plugin to use SwcCompiler for JS files
  s.write('packages/local-plugin/plugin.js', `
var fs = Plugin.fs;
var path = Plugin.path;

// Import SwcCompiler from babel-compiler package
var SwcCompiler = Package['babel-compiler'].SwcCompiler;

// Register compiler for .js files using SwcCompiler
Plugin.registerCompiler({
  extensions: ['js'],
  archMatching: 'os'
}, function () {
  return new SwcJsCompiler();
});

// SwcCompiler for JS files
var SwcJsCompiler = function () {
  var self = this;
  self.runCount = 0;
  self.diskCache = null;

  // Create an instance of the SwcCompiler with swc: true
  self.compiler = new SwcCompiler({ verbose: true });
};
SwcJsCompiler.prototype.processFilesForTarget = function (inputFiles) {
  var self = this;

  // Use the SwcCompiler to process the files
  self.compiler.processFilesForTarget(inputFiles);

  console.log("SwcJsCompiler invocation", ++self.runCount);
  if (self.diskCache) {
    fs.writeFileSync(self.diskCache, self.runCount + '\\n');
  }
};
SwcJsCompiler.prototype.setDiskCacheDirectory = function (diskCacheDir) {
  var self = this;
  self.diskCache = path.join(diskCacheDir, 'swc-cache');

  // Pass the disk cache directory to the SwcCompiler
  if (self.compiler && self.compiler.setDiskCacheDirectory) {
    self.compiler.setDiskCacheDirectory(diskCacheDir);
  }

  try {
    var data = fs.readFileSync(self.diskCache, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw e;
    return;
  }
  self.runCount = parseInt(data, 10);
};
`);

  // Update package.js to use babel-compiler
  s.write('packages/local-plugin/package.js', `
Package.registerBuildPlugin({
  name: "compileWithSwc",
  sources: ['plugin.js'],
  use: ['babel-compiler']
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
  api.use('babel-compiler');
});
`);

  var run = await startRun(s);

  // The SwcJsCompiler gets used
  await run.match("SwcJsCompiler invocation 1", false, true);

  // Verify that SWC compilation is being applied
  // This is indicated by the SWC verbose log message from babel-compiler.js
  await run.match(/\[Transpiler] Used SWC.*\(app\)/, false, true);

  // Modify the JS file to test recompilation
  s.write("test.js", "const message = 'Updated SWC message'; console.log(message);");
  // SwcJsCompiler gets reused
  await run.match("SwcJsCompiler invocation 2", false, true);

  // Restart meteor to test disk cache
  await run.stop();
  run = await startRun(s);

  // Disk cache gets us up to 3 for SwcJsCompiler
  await run.match("SwcJsCompiler invocation 3", false, true);

  await run.stop();
});

// Test error on duplicate compiler plugins.
selftest.define("compiler plugins - duplicate extension", async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp("myapp", "duplicate-compiler-extensions");
  s.cd("myapp");

  let run = await startRun(s);
  await run.match('Errors prevented startup');
  await run.match('conflict: two packages');
  await run.match('trying to handle *.myext');

  // Fix it by changing one extension.
  s.write('packages/local-plugin/plugin.js',
          s.read('packages/local-plugin/plugin.js').replace('myext', 'xext'));
  await run.match('Modified -- restarting');
  run.waitSecs(30);

  await run.stop();
});

// Test error when the registerCompiler callback throws.
selftest.define("compiler plugins - compiler throws", async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp('myapp', 'compiler-plugin-throws-on-instantiate');
  s.cd('myapp');

  const run = s.run('add', 'local-plugin');
  await run.matchErr('Errors while adding packages');
  await run.matchErr(
    'While running registerCompiler callback in package local-plugin');
  // XXX This is wrong! The path on disk is packages/local-plugin/plugin.js, but
  // at some point we switched to the servePath which is based on the *plugin*'s
  // "package" name.
  await run.matchErr(
    /packages\/compilePrintme_plugin\.js:\d+:\d+: Error in my registerCompiler callback!/
  );
  await run.expectExit(1);
});
