var selftest = require('../selftest.js');
var files = require('../files.js');

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
  run.match('Linting your app.');
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
