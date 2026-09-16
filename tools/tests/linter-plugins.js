var selftest = require('../tool-testing/selftest.js');

var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

async function startRun(sandbox, ...args) {
  var run = sandbox.run(...args);
  await run.match('myapp');
  await run.match('proxy');
  await run.tellMongo(MONGO_LISTENING);
  await run.match("MongoDB");
  return run;
};

async function matchLintingMessages(run, messages, initial) {
  await run.match('Linted your app.');
  run.waitSecs(60);
  for (const message of messages) {
    await run.match(message);
  }

  if (initial) {
    await run.match('Started your app.');
    await run.match('App running at');
  } else {
    await run.match('Meteor server restarted');
  }
}

selftest.define('linter plugins - linting app with local packages', async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  // Create an app that uses coffeescript and less.
  await s.createApp('myapp', 'linting-app');
  s.cd('myapp');

  const run = await startRun(s);

  await matchLintingMessages(run, [
    /While linting files .* app .*Server/,
    /server\.js:1:1: 'GlobalVar'/,
    /While linting files .* app .*Client/,
    /client\.js:1:1: 'GlobalVar'/,
    /While linting files .* my-package .*Server/,
    /package-server\.js:1:1: 'PackageGlobalVar'/,
    /package-server\.js:2:1: 'PermittedGlobal'/,
    /While linting files .* my-package .*Client/,
    /package-client\.js:1:1: 'PackageGlobalVar'/
  ], true);

  s.write('.jshintrc', JSON.stringify({
    undef: false
  }));

  await matchLintingMessages(run, [
    /While linting files .* my-package .*Server/,
    /package-server\.js:1:1: 'PackageGlobalVar'/,
    /package-server\.js:2:1: 'PermittedGlobal'/,
    /While linting files .* my-package .*Client/,
    /package-client\.js:1:1: 'PackageGlobalVar'/
  ]);

  s.write('packages/my-package/.jshintrc', JSON.stringify({
    undef: true,
    predef: ['PermittedGlobal']
  }));

  // no warnings should be printed
  await matchLintingMessages(run, [
    /While linting files .* my-package .*Server/,
    /package-server\.js:1:1: 'PackageGlobalVar'/,
    /While linting files .* my-package .*Client/,
    /package-client\.js:1:1: 'PackageGlobalVar'/
  ]);

  await run.stop();
});


selftest.define('linter plugins - linting app with local packages with `meteor lint`', async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  // Create an app that uses coffeescript and less.
  await s.createApp('myapp', 'linting-app');
  s.cd('myapp');

  const run = s.run('lint');
  run.waitSecs(60);

  const messages = [
    /While linting files .* app .*Server/,
    /server\.js:1:1: 'GlobalVar'/,
    /While linting files .* app .*Client/,
    /client\.js:1:1: 'GlobalVar'/,
    /While linting files .* my-package .*Server/,
    /package-server\.js:1:1: 'PackageGlobalVar'/,
    /package-server\.js:2:1: 'PermittedGlobal'/,
    /While linting files .* my-package .*Client/,
    /package-client\.js:1:1: 'PackageGlobalVar'/
  ];

  for (const message of messages) {
    await run.matchErr(message);
  }
  await run.expectExit(1);
});

selftest.define('linter plugins - linting package with `meteor lint`', async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  // Create an app that uses coffeescript and less.
  await s.createApp('myapp', 'linting-app');
  s.cd('myapp/packages/my-package');

  const run = s.run('lint');
  run.waitSecs(60);

  const messages = [
    /While linting files .* my-package .*Server/,
    /package-server\.js:1:1: 'PackageGlobalVar'/,
    /package-server\.js:2:1: 'PermittedGlobal'/,
    /While linting files .* my-package .*Client/,
    /package-client\.js:1:1: 'PackageGlobalVar'/,
    /While linting files .* my-package .*Cordova/,
    /package-client\.js:1:1: 'PackageGlobalVar'/
  ];

  for (const message of messages) {
    await run.matchErr(message);
  }

  run.forbid('app');

  await run.expectExit(1);
});

async function checkMainModulesLint(check) {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();
  await s.createApp('myapp', 'linting-app');
  s.cd('myapp');
  s.set('MAIN_MODULES_LINTER_CHECK', check);

  s.write('.meteor/packages', [
    'meteor-base',
    'ecmascript',
    'blaze-html-templates',
    'main-modules-package',
    'main-modules-linter',
    '',
  ].join('\n'));
  s.mkdir('packages/main-modules-package');
  s.mkdir('packages/main-modules-package/src');
  s.mkdir('packages/main-modules-package/src/nested');
  s.write('packages/main-modules-package/package.js', [
    'Package.describe({',
    '  name: "main-modules-package",',
    '  version: "0.0.1",',
    '});',
    '',
    'Package.onUse(function (api) {',
    '  api.use(["ecmascript", "main-modules-linter"]);',
    '  api.mainModules("src/**/*.js");',
    '});',
    '',
  ].join('\n'));
  s.write(
    'packages/main-modules-package/src/alpha.js',
    'export const alpha = "alpha";\n'
  );
  s.write(
    'packages/main-modules-package/src/beta.js',
    'export const beta = "beta";\n'
  );
  s.write(
    'packages/main-modules-package/src/nested/gamma.js',
    'export const gamma = "gamma";\n'
  );

  s.mkdir('packages/main-modules-linter');
  s.write('packages/main-modules-linter/package.js', [
    'Package.describe({',
    '  name: "main-modules-linter",',
    '  version: "0.0.1",',
    '});',
    '',
    'Package.registerBuildPlugin({',
    '  name: "lintMainModules",',
    '  sources: ["plugin.js"],',
    '});',
    '',
    'Package.onUse(function (api) {',
    '  api.use("isobuild:linter-plugin");',
    '});',
    '',
  ].join('\n'));
  s.write('packages/main-modules-linter/plugin.js', [
    'Plugin.registerLinter({ extensions: ["js"] }, function () {',
    '  return {',
    '    processFilesForPackage: function (files) {',
    '      if (files[0].getPackageName() !== "main-modules-package") {',
    '        return;',
    '      }',
    '',
    '      var syntheticFiles = files.filter(function (file) {',
    '        return file.getPathInPackage() === "__meteor_main_modules__.js";',
    '      });',
    '',
    '      if (process.env.MAIN_MODULES_LINTER_CHECK === "count") {',
    '        if (syntheticFiles.length !== 1) {',
    '          files[0].error({',
    '            message: "Expected one synthetic main module, got " +',
    '              syntheticFiles.length,',
    '          });',
    '        }',
    '        return;',
    '      }',
    '',
    '      if (process.env.MAIN_MODULES_LINTER_CHECK === "contents") {',
    '        var expected = [',
    '          \'export * from "./src/alpha.js";\',',
    '          \'export * from "./src/beta.js";\',',
    '          \'export * from "./src/nested/gamma.js";\',',
    '          "",',
    '        ].join("\\n");',
    '',
    '        if (syntheticFiles[0].getContentsAsString() !== expected) {',
    '          syntheticFiles[0].error({',
    '            message: "Synthetic main module has unexpected contents",',
    '          });',
    '        }',
    '      }',
    '    },',
    '  };',
    '});',
    '',
  ].join('\n'));

  const run = s.run('lint');
  run.waitSecs(60);
  await run.expectExit(0);
}

selftest.define('linter plugins - synthetic main module contents', async () => {
  await checkMainModulesLint('contents');
});

selftest.define('linter plugins - one synthetic main module', async () => {
  await checkMainModulesLint('count');
});

selftest.define('linter plugins - running with --no-lint', async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  // Create an app that uses coffeescript and less.
  await s.createApp('myapp', 'linting-app');
  s.cd('myapp');

  const run = await startRun(s, '--no-lint');

  run.forbid('Linting');
  run.forbid('linting');
  run.forbid('is not defined');

  await run.match('Started your app');

  await run.stop();
});

selftest.define('linter plugins - lint package on `meteor publish`', async () => {
  const s = new Sandbox({ fakeMongo: true });
  await s.init();

  // create an app that contains a package we want to publish
  await s.createApp('myapp', 'lint-on-publish');
  s.cd('myapp/packages/my-package');
  s.set('METEOR_TEST_NO_PUBLISH', 't');

  {
    const run = s.run('publish');

    // expected messages from my-package package...
    const messages = [
        /While linting files .* my-package .*Server/,
        /my-package.js:1:1: 'PackageVar'/,
        /While linting files .* my-package .*Client/,
        /my-package.js:1:1: 'PackageVar'/,
        /While linting files .* my-package .*Cordova/,
        /my-package.js:1:1: 'PackageVar'/
    ];

    for (const message of messages) {
      await run.matchErr(message);
    }
    // but not from the app or dependent package
    run.forbid('app');
    run.forbid('dep-package');

    await run.expectExit(1);
  }

  {
    // Try again with --no-lint.
    const run = s.run('publish', '--no-lint');

    // advances further and stops due to METEOR_TEST_NO_PUBLISH
    await run.matchErr(/Would publish the package at this point/);
    run.forbid('linting');

    await run.expectExit(0);
  }
});
