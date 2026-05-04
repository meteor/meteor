var _ = require('underscore');
var selftest = require('../tool-testing/selftest.js');
var files = require('../fs/files');
import { host } from '../utils/archinfo';
const osArch = host();

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

// Tests the actual cache logic used by coffeescript.
selftest.define("compiler plugin caching - coffee", async () => {
  // Enable legacy builds for testing.
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '{ "webArchOnly": false }';

  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp("myapp", "caching-coffee");
  s.cd("myapp");
  // Ask them to print out when they build a file (instead of using it from the
  // cache) as well as when they load cache from disk.
  s.set('METEOR_COFFEESCRIPT_CACHE_DEBUG', 't');

  // Enforcing the order of builds is just too tricky if we let the legacy
  // build race with the os.* build.
  s.set("METEOR_DISALLOW_DELAYED_LEGACY_BUILD", "true");

  var run = await startRun(s);

  let nextRunOrdinal = 1;
  function matchRun(files, arch) {
    let text = "CACHE(coffeescript): Ran (#" +
      nextRunOrdinal++ + ") on: " +
      JSON.stringify(files);

    if (arch) {
      text += " " + JSON.stringify([arch]);
    }

    return run.match(text);
  }

  // First program built (server or web.browser) compiles everything.
  await matchRun([
    '/f1.coffee',
    '/f2.coffee',
    '/f3.coffee',
    '/packages/local-pack/p.coffee'
  ], "web.browser");

  await matchRun([
    '/f1.coffee',
    '/f2.coffee',
    '/f3.coffee',
    '/packages/local-pack/p.coffee'
  ], "web.browser.legacy");

  await matchRun([
    '/f1.coffee',
    '/f2.coffee',
    '/f3.coffee',
    '/packages/local-pack/p.coffee'
  ], osArch);

  // App prints this:
  await run.match("Coffeescript X is 2 Y is 1 FromPackage is 4");
  await run.match("App running at");

  s.write("f2.coffee", "share.Y = 'Y is 3'\n");

  // Only recompiles f2.
  await matchRun(["/f2.coffee"], "web.browser");
  await matchRun(["/f2.coffee"], "web.browser.legacy");
  await matchRun(["/f2.coffee"], osArch);

  // Program prints this:
  await run.match("Coffeescript X is 2 Y is 3 FromPackage is 4");
  await run.match("Meteor server restarted");

  // Force a rebuild of the local package without actually changing the
  // coffeescript file in it. This should not require us to coffee.compile
  // anything (for either program).
  s.append("packages/local-pack/package.js", "\n// foo\n");

  await matchRun([], "web.browser");
  await matchRun([], "web.browser.legacy");
  await matchRun([], osArch);

  await run.match("Coffeescript X is 2 Y is 3 FromPackage is 4");
  await run.match("Meteor server restarted");

  // But writing to the actual source file in the local package should
  // recompile.
  s.write("packages/local-pack/p.coffee", "FromPackage = 'FromPackage is 5'");

  await matchRun(["/packages/local-pack/p.coffee"], "web.browser");
  await matchRun(["/packages/local-pack/p.coffee"], "web.browser.legacy");
  await matchRun(["/packages/local-pack/p.coffee"], osArch);

  await run.match("Coffeescript X is 2 Y is 3 FromPackage is 5");
  await run.match("Meteor server restarted");

  // We never should have loaded cache from disk, since we only made
  // each compiler once and there were no cache files at this point.
  run.forbid('CACHE(coffeescript): Loaded');

  // Kill the run. Change one coffee file and re-run.
  await run.stop();
  s.write("f2.coffee", "share.Y = 'Y is edited'\n");
  run = await startRun(s);

  // This time there's a cache to load!
  await run.match('CACHE(coffeescript): Loaded /packages/local-pack/p.coffee');
  await run.match('CACHE(coffeescript): Loaded /f1.coffee');
  await run.match('CACHE(coffeescript): Loaded /f3.coffee');
  // And we only need to re-compiler the changed file, even though we restarted.

  nextRunOrdinal = 1;

  await matchRun(["/f2.coffee"], "web.browser");
  await matchRun(["/f2.coffee"], "web.browser.legacy");
  await matchRun(["/f2.coffee"], osArch);

  await run.match('Coffeescript X is 2 Y is edited FromPackage is 5');

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

// Tests the actual cache logic used by less and stylus.
['less'].forEach((packageName) => {
  const extension = packageName === 'stylus' ? 'styl' : packageName;
  const hasCompileOneFileLaterSupport = packageName === "less";

  selftest.define("compiler plugin caching - " + packageName, async () => {
    // Enable legacy builds for testing.
    const currentMeteorModern = process.env.METEOR_MODERN;
    process.env.METEOR_MODERN = '{ "webArchOnly": false }';

    var s = new Sandbox({ fakeMongo: true });
    await s.init();

    await s.createApp("myapp", "caching-" + packageName);
    s.cd("myapp");
    // Ask them to print out when they build a file (instead of using it from
    // the cache) as well as when they load cache from disk.
    s.set(`METEOR_${ packageName.toUpperCase() }_CACHE_DEBUG`, "t");

    // Enforcing the order of builds is just too tricky if we let the legacy
    // build race with the "Client modified - refreshing" messages.
    s.set("METEOR_DISALLOW_DELAYED_LEGACY_BUILD", "true");

    var run = await startRun(s);

    const cacheMatch = selftest.markStack(async (message, arch) => {
      await run.match(`CACHE(${
        packageName
      }): ${
        message
      }${
        arch ? " " + JSON.stringify([arch]) : ""
      }`);
      run.waitSecs(30);
    });

    let nextRunOrdinal = 1;
    function matchRun(files, arch) {
      return cacheMatch(
        "Ran (#" + nextRunOrdinal++ + ") on: " +
          JSON.stringify(files) +
          ((arch && packageName !== "stylus")
           ? " " + JSON.stringify([arch]) : "")
      );
    }

    // First program built (web.browser) compiles everything.
    await matchRun([
      // Plugins with a compileOneFileLater method can avoid compiling
      // lazy files in /imports or /node_modules until they are actually
      // needed, but older plugins still eagerly compile those files just
      // in case they might be imported by a JS module.
      ...(hasCompileOneFileLaterSupport ? []
          : ["/imports/dotdot." + extension]),
      "/subdir/nested-root." + extension,
      "/top." + extension
    ], "web.browser");

    await matchRun([
      ...(hasCompileOneFileLaterSupport ? []
          : ["/imports/dotdot." + extension]),
      "/subdir/nested-root." + extension,
      "/top." + extension
    ], "web.browser.legacy");

    // There is no render execution in the server program, because it has
    // archMatching:'web'.  We'll see this more clearly when the next call later
    // is "#2" --- we didn't miss a call!
    // App prints this:
    run.waitSecs(15);
    await run.match("Hello world");

    // Check that the CSS is what we expect.
    var checkCSS = selftest.markStack(async (borderStyleMap) => {
      var builtBrowserProgramDir = files.pathJoin(
        s.cwd, '.meteor', 'local', 'build', 'programs', 'web.browser');
      var cssFile = _.find(
        files.readdir(
          files.pathJoin(s.cwd, '.meteor/local/build/programs/web.browser')),
        path => path.match(/\.css$/)
      );
      selftest.expectTrue(cssFile);
      var actual = s.read(
        files.pathJoin('.meteor/local/build/programs/web.browser', cssFile));
      actual = actual.replace(/\s+/g, '');  // simplify whitespace
      var expected = _.map(borderStyleMap, (style, className) => {
        return '.' + className + "{border-style:" + style + ";}";
      }).join('');
      await selftest.expectEqual(actual, expected);
    });
    var expectedBorderStyles = {
      el0: "dashed", el1: "dotted", el2: "solid", el3: "groove", el4: "ridge"};
    await checkCSS(expectedBorderStyles);

    // Force a rebuild of the local package without actually changing the
    // preprocessor file in it. This should not require us to render anything.
    s.append("packages/local-pack/package.js", "\n// foo\n");
    await matchRun([], "web.browser");
    await matchRun([], "web.browser.legacy");
    run.waitSecs(15);
    await run.match("Hello world");

    function setVariable(variableName, value) {
      switch (packageName) {
      case 'less':
        return `@${ variableName }: ${ value };\n`;
      case 'stylus':
        return `$${ variableName } = ${ value }\n`;
      }
    }
    function importLine(fileWithoutExtension) {
      switch (packageName) {
      case 'less':
        return `@import "${ fileWithoutExtension }.less";\n`;
      case 'stylus':
        return `@import "${ fileWithoutExtension }.styl"\n`;
      }
    }

    // Writing to a single file only re-renders the root that depends on it.
    s.write('packages/local-pack/p.' + extension,
            setVariable('el4-style', 'inset'));
    expectedBorderStyles.el4 = 'inset';
    await matchRun([`/top.${ extension }`], "web.browser");
    await matchRun([`/top.${ extension }`], "web.browser.legacy");
    await run.match("Client modified -- refreshing");
    await checkCSS(expectedBorderStyles);

    // This works for changing a root too.
    s.write('subdir/nested-root.' + extension,
            '.el0 { border-style: double; }\n');
    expectedBorderStyles.el0 = 'double';
    await matchRun([`/subdir/nested-root.${ extension }`], "web.browser");
    await matchRun([`/subdir/nested-root.${ extension }`], "web.browser.legacy");
    await run.match("Client modified -- refreshing");
    await checkCSS(expectedBorderStyles);

    // Adding a new root works too.
    s.write('yet-another-root.' + extension,
            '.el6 { border-style: solid; }\n');
    expectedBorderStyles.el6 = 'solid';
    await matchRun([`/yet-another-root.${ extension }`], "web.browser");
    await matchRun([`/yet-another-root.${ extension }`], "web.browser.legacy");
    await run.match("Client modified -- refreshing");
    await checkCSS(expectedBorderStyles);

    // We never should have loaded cache from disk, since we only made
    // each compiler once and there were no cache files at this point.
    run.forbid('CACHE(${ packageName }): Loaded');

    // Kill the run. Change one file and re-run.
    await run.stop();
    s.write('packages/local-pack/p.' + extension,
            setVariable('el4-style', 'double'));
    expectedBorderStyles.el4 = 'double';
    run = await startRun(s);

    // This time there's a cache to load!  Note that for
    // MultiFileCachingCompiler we load all the cache entries, even for the
    // not-up-to-date file 'top', because we only key off of filename, not off
    // of cache key.
    await cacheMatch('Loaded {}/subdir/nested-root.' + extension);
    await cacheMatch('Loaded {}/top.' + extension);
    await cacheMatch('Loaded {}/yet-another-root.' + extension);

    nextRunOrdinal = 1;

    await matchRun([`/top.${ extension }`], "web.browser");
    await matchRun([`/top.${ extension }`], "web.browser.legacy");
    run.waitSecs(15);
    await run.match('Hello world');
    await checkCSS(expectedBorderStyles);

    s.write('bad-import.' + extension, importLine('/foo/bad'));
    await run.match('Errors prevented startup');
    switch (packageName) {
    case 'less':
      await run.match('bad-import.less:1: Unknown import: /foo/bad.less');
      break;
    case 'stylus':
      await run.match('bad-import.styl: Stylus compiler error: bad-import.styl:1');
      await run.match('failed to locate @import file /foo/bad.styl');
      break;
    }
    await run.match('Waiting for file change');

    await run.stop();

    process.env.METEOR_MODERN = currentMeteorModern;
  });
});
