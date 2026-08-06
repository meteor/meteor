const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

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
        mode: mode === 'host' || mode === 'host-error' || mode === 'before-error'
          ? 'meteor-host'
          : 'native-only',
        metadata: { mode },
      };
    },
    startBeforeHost() {
      event('start-before-host');
      return { exitCode: mode === 'native-fail' ? 7 : 0 };
    },
    beforeAppRun() {
      event('before-app-run');
      if (mode === 'before-error') {
        throw new Error('Fake provider generation failed before app build.');
      }
    },
    async startHost({ url }) {
      event('start-host');
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
