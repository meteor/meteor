var selftest = require('../tool-testing/selftest.js');
var files = require('../fs/files.js');

var Sandbox = selftest.Sandbox;

var MONGO_LISTENING =
  { stdout: " [initandlisten] waiting for connections on port" };

function startRun(sandbox, ...args) {
  var run = sandbox.run(...args);
  run.match('myapp');
  run.match('proxy');
  run.tellMongo(MONGO_LISTENING);
  run.match("MongoDB");
  return run;
};

function matchLintingMessages(run, messages, initial) {
  run.match('Linted your app.');
  run.waitSecs(60);
  messages.forEach(message => run.match(message));
  if (initial) {
    run.match('Started your app.');
    run.match('App running at');
  } else {
    run.match('Meteor server restarted');
  }
}

selftest.define('linter plugins - linting app with local packages', () => {
  const s = new Sandbox({ fakeMongo: true });

  // Create an app that uses coffeescript and less.
  s.createApp('myapp', 'linting-app');
  s.cd('myapp');

  const run = startRun(s);

  matchLintingMessages(run, [
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

  matchLintingMessages(run, [
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
  matchLintingMessages(run, [
    /While linting files .* my-package .*Server/,
    /package-server\.js:1:1: 'PackageGlobalVar'/,
    /While linting files .* my-package .*Client/,
    /package-client\.js:1:1: 'PackageGlobalVar'/
  ]);

  run.stop();
});


selftest.define('linter plugins - linting app with local packages with `meteor lint`', () => {
  const s = new Sandbox({ fakeMongo: true });

  // Create an app that uses coffeescript and less.
  s.createApp('myapp', 'linting-app');
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

  messages.forEach(message => run.matchErr(message));
  run.expectExit(1);
});

selftest.define('linter plugins - linting package with `meteor lint`', () => {
  const s = new Sandbox({ fakeMongo: true });

  // Create an app that uses coffeescript and less.
  s.createApp('myapp', 'linting-app');
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

  messages.forEach(message => run.matchErr(message));

  run.forbid('app');

  run.expectExit(1);
});

selftest.define('linter plugins - running with --no-lint', () => {
  const s = new Sandbox({ fakeMongo: true });

  // Create an app that uses coffeescript and less.
  s.createApp('myapp', 'linting-app');
  s.cd('myapp');

  const run = startRun(s, '--no-lint');

  run.forbid('Linting');
  run.forbid('linting');
  run.forbid('is not defined');

  run.match('Started your app');

  run.stop();
});

selftest.define('linter plugins - lint package on `meteor publish`', () => {
  const s = new Sandbox({ fakeMongo: true });

  // create an app that contains a package we want to publish
  s.createApp('myapp', 'lint-on-publish');
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

    messages.forEach(message => run.matchErr(message));
    // but not from the app or dependent package
    run.forbid('app');
    run.forbid('dep-package');

    run.expectExit(1);
  }

  {
    // Try again with --no-lint.
    const run = s.run('publish', '--no-lint');

    // advances further and stops due to METEOR_TEST_NO_PUBLISH
    run.matchErr(/Would publish the package at this point/);
    run.forbid('linting');

    run.expectExit(0);
  }
});
