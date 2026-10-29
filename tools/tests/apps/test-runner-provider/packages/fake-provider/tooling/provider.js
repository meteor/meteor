const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

if (Plugin.registerCompiler !== undefined ||
    Plugin.registerMinifier !== undefined ||
    Plugin.registerLinter !== undefined) {
  throw new Error('Test-runner plugins must not receive build-plugin APIs.');
}

function modeFor(context) {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(context.appDir, 'package.json'), 'utf8')
    );
    return packageJson.meteor && packageJson.meteor.fakeProviderMode || 'native';
  } catch {
    return 'native';
  }
}

function event(name) {
  console.log(`[fake-provider] ${name}`);
}

function completeHost(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      new URL('/__meteor__/fake-test-runner/complete', url),
      response => {
        response.resume();
        response.once('end', () => {
          if (response.statusCode === 200) resolve();
          else reject(new Error(`Fake provider host returned ${response.statusCode}.`));
        });
      }
    );
    request.once('error', reject);
  });
}

Plugin.registerTestRunner({
  id: 'fake',
  apiVersion: 1,
  activationPackages: ['fake-provider'],
}, context => {
  event('factory');
  const mode = modeFor(context);
  const isRuntimeWorker = mode === 'workers' && context.worker;
  return {
    validate() {
      event('validate');
      if (mode === 'validation-error') {
        const error = new Error('Fake provider validation failed before prepare.');
        error.code = 'FAKE_PROVIDER_VALIDATION';
        throw error;
      }
    },
    prepare() {
      event('prepare');
      return {
        mode: mode === 'host' || mode === 'host-error' ||
          mode === 'before-error' || isRuntimeWorker
          ? 'meteor-host'
          : 'native-only',
        metadata: { mode },
        buildPluginOptions: {
          'fake-provider-compiler': { ready: true },
        },
      };
    },
    startBeforeHost() {
      event('start-before-host');
      if (mode === 'workers' && !isRuntimeWorker) {
        const workerCount = context.options.runtimeWorkers;
        event(`workers-start ${workerCount}`);
        const hosts = Array.from({ length: workerCount }, (_, index) => ({
          id: `worker-${index + 1}`,
          payload: { ordinal: index + 1 },
        }));
        const workers = context.meteorHosts.start(hosts);
        return {
          process: {
            completion: workers.completion.then(result => {
              event(`worker-results ${result.workers.map(
                worker => `${worker.id}:${worker.code}`
              ).join(',')}`);
              return result.workers.find(worker => worker.code !== 0)?.code || 0;
            }),
            stop: signal => workers.stop(signal),
          },
        };
      }
      return { exitCode: mode === 'native-fail' ? 7 : 0 };
    },
    beforeAppRun() {
      event('before-app-run');
      if (mode === 'before-error') {
        throw new Error('Fake provider generation failed before app build.');
      }
    },
    async startHost({ url }) {
      event(isRuntimeWorker ? `worker-${context.worker.id}-start-host` : 'start-host');
      if (mode === 'host-error') {
        throw new Error('Fake provider host failed after app startup.');
      }
      await completeHost(url);
    },
    stop() {
      event('stop');
    },
  };
});
