import { Tinytest } from 'meteor/tinytest';
import { setGlobalState } from 'meteor/tools-core/lib/global-state';

import {
  isMeteorIndexReadyResponse,
} from './lib/readiness.js';
import {
  getCapacitorDependenciesForPlatforms,
  isCapacitorDepDeclared,
} from './lib/dependencies.js';
import {
  scheduleCapRunAfterMeteorReady,
  _getCapRunArgsFromEnv,
  _mergeExtraArgsWithEnv,
} from './lib/processes.js';

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
    delete process.env.METEOR_CAPACITOR_FLAVOR;
    delete process.env.METEOR_CAPACITOR_SCHEME;
    delete process.env.METEOR_CAPACITOR_LIST;
    delete process.env.METEOR_CAPACITOR_LIVE_RELOAD;

    test.equal(_getCapRunArgsFromEnv(), []);

    process.env.METEOR_CAPACITOR_FLAVOR = 'dev';
    process.env.METEOR_CAPACITOR_SCHEME = 'AppScheme';
    process.env.METEOR_CAPACITOR_LIST = 'true';
    process.env.METEOR_CAPACITOR_LIVE_RELOAD = '1';

    const args = _getCapRunArgsFromEnv();
    test.isTrue(args.includes('--flavor=dev'));
    test.isTrue(args.includes('--scheme=AppScheme'));
    test.isTrue(args.includes('--list'));
    test.isTrue(args.includes('--live-reload'));
  } finally {
    process.env = originalEnv;
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
