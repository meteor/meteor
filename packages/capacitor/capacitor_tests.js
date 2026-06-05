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
} from './lib/processes.js';

const RUN_LAUNCH_STATE_KEY = 'capacitor.run.launchScheduled';

function clearLaunchState() {
  setGlobalState(RUN_LAUNCH_STATE_KEY, null);
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

Tinytest.add('capacitor - dependencies - add-platform scopes native platform package', test => {
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
  clearLaunchState();

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

  clearLaunchState();
});

Tinytest.addAsync('capacitor - run launch retries after readiness failure', async test => {
  clearLaunchState();

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

  clearLaunchState();
});
