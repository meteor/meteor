jest.mock('../fs/files', () => ({
  convertToOSPath: value => value,
  prettyPath: value => value,
}));
jest.mock('../utils/buildmessage.js', () => ({
  capture: async callback => callback(),
  enterJob: async (_options, callback) => callback(),
}));
jest.mock('../utils/utils.js', () => ({
  parseUrl: () => ({ pathname: '' }),
  randomPort: () => 3001,
}));
jest.mock('./run-log.js', () => ({
  finish: jest.fn(),
  log: jest.fn(),
}));
jest.mock('../packaging/release.js', () => ({ current: {} }));
jest.mock('../console/console.js', () => ({ Console: {} }));
jest.mock('./run-proxy.js', () => ({
  Proxy: class {
    async start() {}
    async stop() {}
  },
}));
jest.mock('./run-selenium.js', () => ({ Selenium: class {} }));
jest.mock('./run-mongo.js', () => ({ MongoRunner: class {} }));
jest.mock('./run-hmr.js', () => ({ HMRServer: class {} }));
jest.mock('./run-updater.js', () => ({
  Updater: class {
    start() {}
    async stop() {}
  },
}));

let mockAppRunnerOptions;
jest.mock('./run-app.js', () => ({
  AppRunner: class {
    constructor(options) {
      mockAppRunnerOptions = options;
    }

    makeBeforeStartPromise() {
      return () => {};
    }

    async start() {}

    async stop() {}
  },
}));

const {
  combineTestRunnerExitCode,
  run,
} = require('./run-all.js');

describe('test runner completion', () => {
  test('uses the provider exit code only after a successful test run', () => {
    expect(combineTestRunnerExitCode(0, { exitCode: 1 })).toBe(1);
    expect(combineTestRunnerExitCode(2, { exitCode: 1 })).toBe(2);
    expect(combineTestRunnerExitCode(0, undefined)).toBe(0);
  });

  test('completes a one-shot host run before provider cleanup', async () => {
    const calls = [];
    const session = {
      async startHost() {
        calls.push('startHost');
        mockAppRunnerOptions.onRunEnd({ outcome: 'terminated', code: 0 });
      },
      async completeRun(context) {
        calls.push(['completeRun', context]);
        return { exitCode: 1 };
      },
      async stop() {
        calls.push('stop');
      },
    };

    await expect(run({
      buildOptions: { buildMode: 'test' },
      once: true,
      projectContext: {
        packageMap: { getInfo: () => null },
        projectDir: '/app',
      },
      proxyPort: 3000,
      rootUrl: 'http://localhost:3000',
      testRunnerSession: session,
    })).resolves.toBe(1);

    expect(calls).toEqual([
      'startHost',
      ['completeRun', { exitCode: 0, outcome: 'completed' }],
      'stop',
    ]);
  });
});
