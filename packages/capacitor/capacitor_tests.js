import { Tinytest } from 'meteor/tinytest';
import { setGlobalState } from 'meteor/tools-core/lib/global-state';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  isMeteorIndexReadyResponse,
} from './lib/readiness.js';
import {
  getCapacitorDependenciesForPlatforms,
  isCapacitorDepDeclared,
} from './lib/dependencies.js';
import {
  getCapacitorEnv,
  scheduleCapRunAfterMeteorReady,
  _getCapCommand,
  _ensureCapacitorWebDirIndex,
  _getCapRunArgsFromEnv,
  _mergeExtraArgsWithEnv,
} from './lib/processes.js';
import {
  _syncBundleFiles,
} from './lib/transforms.js';

const RUN_LAUNCH_STATE_KEY = 'capacitor.run.launchScheduled';
const RUN_PROCESS_STATE_KEY = 'capacitor.process.run';

function clearRunState() {
  setGlobalState(RUN_LAUNCH_STATE_KEY, null);
  setGlobalState(RUN_PROCESS_STATE_KEY, null);
}

function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function dependencyNamesForPlatforms(platforms) {
  return getCapacitorDependenciesForPlatforms(platforms).map(dep => dep.name);
}

function dependencyByName(name, platforms) {
  return getCapacitorDependenciesForPlatforms(platforms).find(dep => dep.name === name);
}

Tinytest.add('capacitor - dependencies - default includes both native platforms', test => {
  const dependencies = dependencyNamesForPlatforms();

  test.isTrue(dependencies.includes('@capacitor/core'));
  test.isTrue(dependencies.includes('@capacitor/cli'));
  test.isTrue(dependencies.includes('@meteorjs/capacitor'));
  test.isTrue(dependencies.includes('@capacitor/android'));
  test.isTrue(dependencies.includes('@capacitor/ios'));
});

Tinytest.add('capacitor - dependencies - platform scope includes only selected native package', test => {
  const androidDependencies = dependencyNamesForPlatforms(['android']);
  test.isTrue(androidDependencies.includes('@capacitor/core'));
  test.isTrue(androidDependencies.includes('@capacitor/cli'));
  test.isTrue(androidDependencies.includes('@meteorjs/capacitor'));
  test.isTrue(androidDependencies.includes('@capacitor/android'));
  test.isFalse(androidDependencies.includes('@capacitor/ios'));

  const iosDependencies = dependencyNamesForPlatforms(['ios']);
  test.isTrue(iosDependencies.includes('@capacitor/core'));
  test.isTrue(iosDependencies.includes('@capacitor/cli'));
  test.isTrue(iosDependencies.includes('@meteorjs/capacitor'));
  test.isFalse(iosDependencies.includes('@capacitor/android'));
  test.isTrue(iosDependencies.includes('@capacitor/ios'));
});

Tinytest.add('capacitor - dependencies - native packages are runtime dependencies', test => {
  test.isFalse(dependencyByName('@capacitor/core').dev);
  test.isFalse(dependencyByName('@capacitor/android').dev);
  test.isFalse(dependencyByName('@capacitor/ios').dev);
  test.isTrue(dependencyByName('@capacitor/cli').dev);
  test.isTrue(dependencyByName('@meteorjs/capacitor').dev);
});

Tinytest.add('capacitor - dependencies - declaration must be in expected section', test => {
  test.isTrue(isCapacitorDepDeclared(
    dependencyByName('@capacitor/android'),
    { dependencies: { '@capacitor/android': '^7.4.3' } }
  ));
  test.isFalse(isCapacitorDepDeclared(
    dependencyByName('@capacitor/android'),
    { devDependencies: { '@capacitor/android': '^7.4.3' } }
  ));
  test.isTrue(isCapacitorDepDeclared(
    dependencyByName('@capacitor/cli'),
    { devDependencies: { '@capacitor/cli': '^7.4.3' } }
  ));
  test.isFalse(isCapacitorDepDeclared(
    dependencyByName('@capacitor/cli'),
    { dependencies: { '@capacitor/cli': '^7.4.3' } }
  ));
});

Tinytest.add('capacitor - readiness - accepts Meteor index HTML', test => {
  test.isTrue(isMeteorIndexReadyResponse({
    statusCode: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<html><script>__meteor_runtime_config__ = {}</script></html>',
  }));
});

Tinytest.add('capacitor - readiness - rejects non-index responses', test => {
  test.isFalse(isMeteorIndexReadyResponse({
    statusCode: 200,
    headers: { 'content-type': 'text/html' },
    body: '<html>missing runtime config</html>',
  }));

  test.isFalse(isMeteorIndexReadyResponse({
    statusCode: 503,
    headers: { 'content-type': 'text/html' },
    body: '<html><script>__meteor_runtime_config__ = {}</script></html>',
  }));

  test.isFalse(isMeteorIndexReadyResponse({
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: '{"__meteor_runtime_config__":true}',
  }));
});

Tinytest.add('capacitor - cli - prefers the app-local cap binary', test => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-cap-cli-'));
  try {
    const binDir = path.join(tempDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const binName = process.platform === 'win32' ? 'cap.cmd' : 'cap';
    const localCap = path.join(binDir, binName);
    fs.writeFileSync(localCap, '', 'utf8');
    fs.chmodSync(localCap, 0o755);

    const command = _getCapCommand(['add', 'android'], { cwd: tempDir });

    test.equal(command.command, localCap);
    test.equal(command.args, ['add', 'android']);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

Tinytest.add('capacitor - cli - creates placeholder webDir for native add', test => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-cap-webdir-'));
  try {
    const indexPath = _ensureCapacitorWebDirIndex({
      appDir: tempDir,
      webDir: '_build/native-prod',
    });

    test.isTrue(fs.existsSync(indexPath));
    test.equal(
      fs.readFileSync(indexPath, 'utf8'),
      '<!doctype html><html><head><meta charset="utf-8"><title>Meteor Capacitor</title></head><body></body></html>\n'
    );

    fs.writeFileSync(indexPath, 'existing', 'utf8');
    _ensureCapacitorWebDirIndex({
      appDir: tempDir,
      webDir: '_build/native-prod',
    });

    test.equal(fs.readFileSync(indexPath, 'utf8'), 'existing');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

Tinytest.add('capacitor - transform - preserves app directory asset paths', test => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-cap-sync-'));
  try {
    const sourceDir = path.join(tempDir, '.meteor', 'local', 'build', 'programs', 'web.cordova');
    fs.mkdirSync(path.join(sourceDir, 'app'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'packages'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'program.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'body.html'), '<body></body>', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'app', 'global-imports.js'), 'imports', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'app', 'app.js'), 'app', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'packages', 'meteor.js'), 'meteor', 'utf8');

    const ok = _syncBundleFiles({
      appDir: tempDir,
      webDir: '_build/native-dev',
    });

    test.isTrue(ok);
    test.isTrue(fs.existsSync(path.join(tempDir, '_build', 'native-dev', 'app', 'global-imports.js')));
    test.isTrue(fs.existsSync(path.join(tempDir, '_build', 'native-dev', 'app', 'app.js')));
    test.isTrue(fs.existsSync(path.join(tempDir, '_build', 'native-dev', 'packages', 'meteor.js')));
    test.isFalse(fs.existsSync(path.join(tempDir, '_build', 'native-dev', 'program.json')));
    test.isFalse(fs.existsSync(path.join(tempDir, '_build', 'native-dev', 'body.html')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

Tinytest.add('capacitor - env - platform override is explicit', test => {
  const env = getCapacitorEnv({ platform: 'android' });

  test.equal(env.METEOR_CAPACITOR, 'true');
  test.equal(env.METEOR_CAPACITOR_PLATFORM, 'android');
});

Tinytest.addAsync('capacitor - run launch waits for readiness once', async test => {
  clearRunState();

  let releaseReady;
  let waitCalls = 0;
  let resolveCalls = 0;
  const runs = [];

  const scheduled = scheduleCapRunAfterMeteorReady({
    appDir: '/tmp/app',
    platform: 'android',
    readinessUrl: 'http://127.0.0.1:3000/',
    extraArgs: ['--no-sync'],
    waitForReady: async ({ url }) => {
      waitCalls += 1;
      test.equal(url, 'http://127.0.0.1:3000/');
      return new Promise(resolve => {
        releaseReady = resolve;
      });
    },
    resolveTarget: async ({ platform }) => {
      resolveCalls += 1;
      test.equal(platform, 'android');
      return 'emulator-5554';
    },
    run: options => {
      runs.push(options);
    },
  });

  const duplicate = scheduleCapRunAfterMeteorReady({
    appDir: '/tmp/app',
    platform: 'android',
    waitForReady: async () => ({ ok: true }),
    run: options => {
      runs.push(options);
    },
  });

  await nextTick();

  test.isTrue(scheduled);
  test.isFalse(duplicate);
  test.equal(waitCalls, 1);
  test.equal(resolveCalls, 0);
  test.equal(runs.length, 0);

  releaseReady({ ok: true });
  await nextTick();

  test.equal(resolveCalls, 1);
  test.equal(runs.length, 1);
  test.equal(runs[0].extraArgs, ['--no-sync', '--target=emulator-5554']);

  clearRunState();
});

Tinytest.addAsync('capacitor - run launch retries after readiness failure', async test => {
  clearRunState();

  const failed = scheduleCapRunAfterMeteorReady({
    appDir: '/tmp/app',
    platform: 'ios',
    waitForReady: async () => ({ ok: false }),
    run: () => {
      throw new Error('cap run should not launch when readiness fails');
    },
  });

  await nextTick();
  await nextTick();

  const retried = scheduleCapRunAfterMeteorReady({
    appDir: '/tmp/app',
    platform: 'ios',
    waitForReady: async () => ({ ok: true }),
    resolveTarget: async () => null,
    run: () => {},
  });

  test.isTrue(failed);
  test.isTrue(retried);

  clearRunState();
});

Tinytest.add('capacitor - run - environment variables mapping', test => {
  const originalEnv = { ...process.env };
  try {
    // Clear relevant env vars
    Object.keys(process.env).forEach(k => {
      if (k.startsWith('METEOR_CAPACITOR_')) delete process.env[k];
    });

    test.equal(_getCapRunArgsFromEnv(), []);

    process.env.METEOR_CAPACITOR_FLAVOR = 'dev';
    process.env.METEOR_CAPACITOR_LIST = 'true';
    process.env.METEOR_CAPACITOR_SOME_NEW_FUTURE_OPTION = 'hello';
    process.env.METEOR_CAPACITOR_FORWARD_PORTS = '8080:80';

    const args = _getCapRunArgsFromEnv();
    test.isTrue(args.includes('--flavor=dev'));
    test.isTrue(args.includes('--list'));
    test.isTrue(args.includes('--some-new-future-option=hello'));
    test.isTrue(args.includes('--forwardPorts=8080:80'));
    
    // Ensure internal ones are excluded
    process.env.METEOR_CAPACITOR_AUTO_PICK_TARGET = 'true';
    test.isFalse(_getCapRunArgsFromEnv().includes('--auto-pick-target'));

    process.env.METEOR_CAPACITOR_SKIP_NATIVE_RUN = 'true';
    test.isFalse(_getCapRunArgsFromEnv().includes('--skip-native-run'));
  } finally {
    process.env = originalEnv;
  }
});

Tinytest.addAsync('capacitor - run launch can skip native run after readiness', async test => {
  clearRunState();

  const originalEnv = { ...process.env };
  try {
    process.env.METEOR_CAPACITOR_SKIP_NATIVE_RUN = 'true';

    let releaseReady;
    let waitCalls = 0;
    let beforeRunCalls = 0;
    let resolveCalls = 0;
    let runCalls = 0;

    const scheduled = scheduleCapRunAfterMeteorReady({
      appDir: '/tmp/app',
      platform: 'android',
      readinessUrl: 'http://127.0.0.1:3000/',
      waitForReady: async ({ url }) => {
        waitCalls += 1;
        test.equal(url, 'http://127.0.0.1:3000/');
        return new Promise(resolve => {
          releaseReady = resolve;
        });
      },
      beforeRun: async ({ appDir, platform }) => {
        beforeRunCalls += 1;
        test.equal(appDir, '/tmp/app');
        test.equal(platform, 'android');
        return true;
      },
      resolveTarget: async () => {
        resolveCalls += 1;
        return 'emulator-5554';
      },
      run: () => {
        runCalls += 1;
      },
    });

    await nextTick();

    test.isTrue(scheduled);
    test.equal(waitCalls, 1);
    test.equal(beforeRunCalls, 0);
    test.equal(resolveCalls, 0);
    test.equal(runCalls, 0);

    releaseReady({ ok: true });
    await nextTick();

    test.equal(beforeRunCalls, 1);
    test.equal(resolveCalls, 0);
    test.equal(runCalls, 0);

    const rescheduled = scheduleCapRunAfterMeteorReady({
      appDir: '/tmp/app',
      platform: 'android',
      waitForReady: async () => ({ ok: true }),
      resolveTarget: async () => null,
      run: () => {},
    });

    test.isTrue(rescheduled);
  } finally {
    process.env = originalEnv;
    clearRunState();
  }
});

Tinytest.add('capacitor - run - env vars merge with extraArgs', test => {
  const originalEnv = { ...process.env };
  try {
    process.env.METEOR_CAPACITOR_TARGET = 'emulator-1';
    process.env.METEOR_CAPACITOR_NO_SYNC = 'true';

    // extraArgs has --target=manual-target, should win over env var
    const extraArgs = ['--target=manual-target'];
    const merged = _mergeExtraArgsWithEnv(extraArgs);

    test.isTrue(merged.includes('--target=manual-target'));
    test.isTrue(merged.includes('--no-sync'));
    
    // Ensure no duplication of --target
    const targetFlags = merged.filter(a => a.startsWith('--target'));
    test.equal(targetFlags.length, 1);
  } finally {
    process.env = originalEnv;
  }
});

Tinytest.add('capacitor - run - deduplication avoids false positives', test => {
  const originalEnv = { ...process.env };
  try {
    process.env.METEOR_CAPACITOR_TARGET = 'env-target';
    
    // --target-name should not collide with --target
    const extraArgs = ['--target-name=MyiPhone'];
    const merged = _mergeExtraArgsWithEnv(extraArgs);

    test.isTrue(merged.includes('--target-name=MyiPhone'));
    test.isTrue(merged.includes('--target=env-target'));
    test.equal(merged.length, 2);
  } finally {
    process.env = originalEnv;
  }
});
