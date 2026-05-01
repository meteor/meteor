var selftest = require('../tool-testing/selftest.js');
import { isTestFilePath } from '../isobuild/test-files';
const expectEqual = selftest.expectEqual;
var Sandbox = selftest.Sandbox;

selftest.define("'meteor test --port' accepts/rejects proper values", async function () {
  var s = new Sandbox();
  await s.init();

  var run;

  await s.createApp("myapp", "standard-app");
  s.cd("myapp");
  s.set("");

  var runAddPackage = s.run("add", "tmeasday:acceptance-test-driver");
  runAddPackage.waitSecs(30);
  await runAddPackage.match(/tmeasday:acceptance-test-driver\b.*?added/)
  await runAddPackage.expectExit(0);

  run = s.run("test", "--port", "3700", "--driver-package", "tmeasday:acceptance-test-driver");
  run.waitSecs(30);
  await run.match('App running at http://localhost:3700/');
  await run.stop();

  run = s.run("test", "--port", "127.0.0.1:3700", "--driver-package", "tmeasday:acceptance-test-driver");
  run.waitSecs(30);
  await run.match('App running at http://127.0.0.1:3700/');
  await run.stop();

  run = s.run("test", "--port", "[::]:3700", "--driver-package", "tmeasday:acceptance-test-driver");
  run.waitSecs(30);
  await run.match('App running at http://[::]:3700/');
  await run.stop();
});

selftest.define("'meteor test' eagerly loads correct files", async () => {
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

  // DIAGNOSTIC (remove once CI-only "Type oid already present" is rooted out):
  // dump the on-disk state of the combined isopacket right before we spawn
  // the child meteor that fails. We see only one mongo-id load entry locally
  // and the failure is CI-only, so this captures whether the artifact looks
  // different on the runner than on dev machines.
  {
    const fs = require('fs');
    const nodePath = require('path');
    const files = require('../fs/files');
    const root = files.getCurrentToolsDir();
    const isopacketDir = nodePath.join(root, '.meteor', 'isopackets', 'combined');
    const programJson = nodePath.join(isopacketDir, 'program.json');
    const mongoIdJs = nodePath.join(isopacketDir, 'packages', 'mongo-id.js');
    const buildinfo = nodePath.join(isopacketDir, 'isopacket-buildinfo.json');
    try {
      const src = fs.readFileSync(programJson, 'utf8');
      const pathRe = /"path"\s*:\s*"([^"]+)"/g;
      const paths = [];
      let m;
      while ((m = pathRe.exec(src))) paths.push(m[1]);
      const counts = {};
      for (const p of paths) counts[p] = (counts[p] || 0) + 1;
      const dups = Object.entries(counts).filter(([, n]) => n > 1);
      console.log('[ISOPACKET-DIAG] program.json load entries:', paths.length);
      console.log('[ISOPACKET-DIAG] mongo-id entries:',
        paths.filter(p => p.includes('mongo-id')).join(', ') || '(none)');
      console.log('[ISOPACKET-DIAG] ejson entries:',
        paths.filter(p => p.includes('ejson')).join(', ') || '(none)');
      console.log('[ISOPACKET-DIAG] duplicated paths:',
        dups.length ? JSON.stringify(dups) : '(none)');
    } catch (e) {
      console.log('[ISOPACKET-DIAG] program.json read failed:', e.message);
    }
    try {
      const src = fs.readFileSync(mongoIdJs, 'utf8');
      const addTypeMatches = src.match(/EJSON\.addType\s*\(\s*["']oid["']/g) || [];
      console.log('[ISOPACKET-DIAG] mongo-id.js bytes:', src.length);
      console.log('[ISOPACKET-DIAG] mongo-id.js addType("oid") count:', addTypeMatches.length);
    } catch (e) {
      console.log('[ISOPACKET-DIAG] mongo-id.js read failed:', e.message);
    }
    try {
      const st = fs.statSync(buildinfo);
      console.log('[ISOPACKET-DIAG] buildinfo mtime:', st.mtime.toISOString(),
        'size:', st.size);
    } catch (e) {
      console.log('[ISOPACKET-DIAG] buildinfo stat failed:', e.message);
    }
  }

  // Integration tests for test file eager loading with `meteor test` and
  // `meteor test --full-app`
  const s = new Sandbox();
  await s.init();
  let run;

  await s.createApp('myapp', 'test-eagerly-load');
  s.cd('myapp');
  s.set('');

  // `meteor` should load app files, but not test files or app-test files
  run = s.run();
  run.waitSecs(30);
  await run.match('index.js');
  await run.stop();
  run.forbid('foo.test.js');
  run.forbid('foo.app-test.js');

  // `meteor test` should load test files, but not app files or app-test files
  run = s.run('test', '--driver-package', 'tmeasday:acceptance-test-driver');
  run.waitSecs(30);
  await run.match('foo.test.js');
  await run.stop();
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
  run.waitSecs(30);
  await run.match('foo.app-test.js');
  await run.match('index.js');
  await run.stop();
  run.forbid('foo.test.js');
});
