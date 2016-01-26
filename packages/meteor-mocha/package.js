// Using the "wrapper package" version format
Package.describe({
  name: "practicalmeteor:mocha",
  summary: "Write package tests with mocha and run them in the browser or from the command line with spacejam.",
  git: "https://github.com/practicalmeteor/meteor-mocha.git",
  version: '2.1.0_7'
});


Package.onUse(function (api) {
  if (!global.testCommandMetadata) {
    return;
  }

  api.addFiles('start.css', 'client');
  api.versionsFrom('1.0');

  api.use('coffeescript');
  api.use('underscore');
  api.use('session');
  api.use('reload');
  api.use('ddp');
  api.use('random');
  api.use('mongo');
  api.use('autoupdate');

  // If we use a reactive reporter such as meteor's test-in-browser one,
  // we'll need all of this.
  api.use(['blaze', 'templating', 'spacebars', 'tracker'], 'client');

  api.use([
    'practicalmeteor:loglevel@1.2.0_2',
    'practicalmeteor:chai@2.1.0_1',
    'practicalmeteor:sinon@1.14.1_2',
    'practicalmeteor:mocha-core@0.1.4'
  ]);

  api.imply([
    'practicalmeteor:loglevel@1.2.0_2',
    'practicalmeteor:chai@2.1.0_1',
    'practicalmeteor:sinon@1.14.1_2',
    'practicalmeteor:mocha-core@0.1.4'
  ]);

  // So meteor-web-driver will be available from the command line
  // api.imply(['practicalmeteor:mocha-web-driver@0.9.0-rc0']);

  // Uncomment once we upgrade to loglevel v2
  //api.addFiles('src/lib/log.js');

  api.addFiles(['meteor/src/lib/namespaces.coffee']);

  api.addFiles([
    'meteor/src/server/autoupdate.js',
    'meteor/src/server/MochaBindEnvironment.js'
  ], 'server');

  api.addFiles(['meteor/src/lib/log.js']);

  api.addFiles('mocha.js');

  api.addFiles('meteor/src/server/mocha.coffee', 'server');

  api.addFiles([
    'meteor/src/client/mocha.html',
    'mocha.css',
    'meteor/src/client/mocha-setup.coffee'
  ], 'client');

  api.addFiles('meteor/src/lib/BaseReporter.coffee');
  api.addFiles('meteor/src/lib/JsonStreamReporter.coffee', 'server');
  api.addFiles('meteor/src/server/MeteorPublishReporter.coffee', 'server');


  api.addFiles('meteor/src/client/ClientServerReporter.coffee', 'client');

  api.addFiles(['meteor/src/lib/MochaRunner.coffee']);
  api.addFiles('meteor/src/client/HtmlReporter.coffee', 'client');
  
  api.addFiles('end.css', 'client');

  api.addFiles('runTests.js', 'client');
  api.export('runTests', 'client');
});


Package.onTest(function (api) {
  api.use([
    'coffeescript',
    'practicalmeteor:mocha',
    'tinytest']);

  api.addFiles('meteor/tests/mocha-globals-test.coffee');
});
