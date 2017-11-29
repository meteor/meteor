var selftest = require('../tool-testing/selftest.js');
import { isTestFilePath } from '../isobuild/test-files';
const expectEqual = selftest.expectEqual;
var Sandbox = selftest.Sandbox;

selftest.define("'meteor test --port' accepts/rejects proper values", function () {
  var s = new Sandbox();
  var run;

  s.createApp("myapp", "standard-app");
  s.cd("myapp");
  s.set("")

  var runAddPackage = s.run("add", "tmeasday:acceptance-test-driver");
  runAddPackage.waitSecs(30);
  runAddPackage.match(/tmeasday:acceptance-test-driver\b.*?added/)
  runAddPackage.expectExit(0);

  run = s.run("test", "--port", "3700", "--driver-package", "tmeasday:acceptance-test-driver");
  run.waitSecs(120);
  run.match('App running at: http://localhost:3700/');
  run.stop();

  run = s.run("test", "--port", "127.0.0.1:3700", "--driver-package", "tmeasday:acceptance-test-driver");
  run.waitSecs(120);
  run.match('App running at: http://127.0.0.1:3700/');
  run.stop();

  run = s.run("test", "--port", "[::]:3700", "--driver-package", "tmeasday:acceptance-test-driver");
  run.waitSecs(120);
  run.match('App running at: http://[::]:3700/');
  run.stop();
});

selftest.define("'meteor test' eagerly loads correct files", () => {
  // Unit tests for test file match regexps
  expectEqual(isTestFilePath('/foo.test.js'), true);
  expectEqual(isTestFilePath('/foo.tests.js'), true);
  expectEqual(isTestFilePath('/foo.spec.js'), true);
  expectEqual(isTestFilePath('/foo.specs.js'), true);
  expectEqual(isTestFilePath('/foo.test.bar.js'), true);
  expectEqual(isTestFilePath('/foo.tests.bar.js'), true);
  expectEqual(isTestFilePath('/foo.spec.bar.js'), true);
  expectEqual(isTestFilePath('/foo.specs.bar.js'), true);
  expectEqual(isTestFilePath('/foo.app-test.js'), true);
  expectEqual(isTestFilePath('/foo.app-tests.js'), true);
  expectEqual(isTestFilePath('/foo.app-spec.js'), true);
  expectEqual(isTestFilePath('/foo.app-specs.js'), true);
  expectEqual(isTestFilePath('/foo.app-test.bar.js'), true);
  expectEqual(isTestFilePath('/foo.app-tests.bar.js'), true);
  expectEqual(isTestFilePath('/foo.app-spec.bar.js'), true);
  expectEqual(isTestFilePath('/foo.app-specs.bar.js'), true);

  // Regression tests for #9332
  expectEqual(isTestFilePath('/foo.testify.js'), false);
  expectEqual(isTestFilePath('/foo.retest.js'), false);
  expectEqual(isTestFilePath('/foo.spectacular.js'), false);
  expectEqual(isTestFilePath('/foo.respec.js'), false);
  expectEqual(isTestFilePath('/foo.testify.bar.js'), false);
  expectEqual(isTestFilePath('/foo.retest.bar.js'), false);
  expectEqual(isTestFilePath('/foo.spectacular.bar.js'), false);
  expectEqual(isTestFilePath('/foo.respec.bar.js'), false);
  expectEqual(isTestFilePath('/foo.app-testify.js'), false);
  expectEqual(isTestFilePath('/foo.reapp-test.js'), false);
  expectEqual(isTestFilePath('/foo.app-spectacular.js'), false);
  expectEqual(isTestFilePath('/foo.reapp-spec.js'), false);
  expectEqual(isTestFilePath('/foo.app-testify.bar.js'), false);
  expectEqual(isTestFilePath('/foo.reapp-test.bar.js'), false);
  expectEqual(isTestFilePath('/foo.app-spectacular.bar.js'), false);
  expectEqual(isTestFilePath('/foo.reapp-spec.bar.js'), false);

  // Integration tests for test file eager loading with `meteor test` and 
  // `meteor test --full-app`
  const s = new Sandbox();
  let run;

  s.createApp('myapp', 'test-eagerly-load');
  s.cd('myapp');
  s.set('');

  // `meteor` should load app files, but not test files or app-test files
  run = s.run();
  run.waitSecs(120);
  run.match('index.js');
  run.stop();
  run.forbid('foo.test.js');
  run.forbid('foo.app-test.js');

  // `meteor test` should load test files, but not app files or app-test files
  run = s.run('test', '--driver-package', 'tmeasday:acceptance-test-driver');
  run.waitSecs(120);
  run.match('foo.test.js');
  run.stop();
  run.forbid('index.js');
  run.forbid('foo.app-test.js');

  // `meteor test --full-app` should load both test files and app-test files,
  // but not test files
  run = s.run(
    'test',
    '--driver-package',
    'tmeasday:acceptance-test-driver',
    '--full-app',
  );
  run.waitSecs(120);
  run.match('foo.app-test.js');
  run.match('index.js');
  run.stop();
  run.forbid('foo.test.js');  
})
