const mockSettings = JSON.stringify({
  privateApiKey: 'synthetic-private-setting',
  public: { harmless: true },
});

jest.mock('request', () => jest.fn(), { virtual: true });
jest.mock('../fs/files', () => ({
  inCheckout: () => true,
  getToolsVersion: () => 'test',
  readFile: () => '',
  OfflineError: class OfflineError extends Error {},
  pathJoin: (...parts) => parts.join('/'),
  mkdtemp: () => '/synthetic/build_tar',
  changeTempDirStatus: () => {},
  exists: () => false,
  findGitCommitHash: async () => 'synthetic-commit',
  getSettings: () => mockSettings,
  createTarGzStream: () => ({ pipe: () => {} }),
}));
jest.mock('../packaging/release.js', () => ({ current: null }));
jest.mock('../utils/utils.js', () => ({ timeoutScaleFactor: 1 }));
jest.mock('../utils/buildmessage.js', () => ({
  capture: async (options, fn) => {
    await fn();
    return { hasMessages: () => false };
  },
  enterJob: async (options, fn) => fn(),
}));
jest.mock('../isobuild/bundler.js', () => ({ bundle: async () => ({}) }));
jest.mock('../tool-env/profile', () => ({ Profile: (name, fn) => fn }));
jest.mock('./stats.js', () => ({ recordPackages: async () => {} }));
jest.mock('./config.js', () => ({ getAccountsDomain: () => 'www.meteor.com' }));
jest.mock('./auth.js', () => ({
  getSessionId: () => null,
  getSessionToken: () => null,
  setSessionId: () => {},
  loggedInUsername: () => null,
  isLoggedIn: () => false,
  pollForRegistrationCompletion: async () => {},
  doInteractivePasswordLogin: async () => false,
}));
jest.mock('../console/console.js', () => ({
  Console: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    rawInfo: jest.fn(),
    isInteractive: () => false,
    command: s => s,
    url: s => s,
  },
}));

const DEPLOY_TOKEN = 'synthetic-galaxy-deploy-token';
const SITE = 'victim.example';

let deploy;
let Console;
let wire;

// Discovery returns 404 so RPCs use the default deploy server.
function load(respond) {
  jest.resetModules();
  wire = [];
  const request = require('request');
  request.mockImplementation((options, callback) => {
    const entry = {
      url: options.url,
      method: options.method || 'GET',
      qs: { ...options.qs },
    };
    wire.push(entry);

    const discovery = options.url.endsWith('/.well-known/meteor/deploy-url');
    const { statusCode, body } = discovery
      ? { statusCode: 404, body: '' }
      : respond(entry);
    process.nextTick(() => callback(null, {
      statusCode,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }, typeof body === 'string' ? body : JSON.stringify(body)));
    return {};
  });
  deploy = require('./deploy.js');
  Console = require('../console/console.js').Console;
}

function galaxy({ deployStatus = 200 } = {}) {
  return entry => {
    if (entry.url.includes('/deploy/')) {
      return deployStatus === 200
        ? { statusCode: 200, body: { url: `https://${SITE}` } }
        : { statusCode: deployStatus, body: 'synthetic deploy failure' };
    }
    return { statusCode: 200, body: {} };
  };
}

function runDeploy() {
  return deploy.bundleAndDeploy({
    projectContext: {
      getProjectLocalDirectory: () => '/synthetic/app',
      getBuildCache: () => null,
    },
    site: SITE,
    settingsFile: 'settings.json',
    deployToken: DEPLOY_TOKEN,
    owner: 'synthetic-owner',
    rawOptions: {},
    buildOptions: {},
    waitForDeploy: false,
    recordPackageUsage: false,
  });
}

function rpcs(operation) {
  return wire.filter(r => r.url.includes(`/${operation}/`));
}

function printedOutput() {
  return Object.values(Console)
    .filter(fn => fn && fn.mock)
    .flatMap(fn => fn.mock.calls)
    .map(args => args.join(' '))
    .join('\n');
}

describe('deploy secrets in request URLs (MET-010)', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DEPLOY_HOSTNAME;
    delete process.env.CAFILE;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  test('only the deploy upload carries the settings file', async () => {
    load(galaxy());

    expect(await runDeploy()).toBe(0);

    expect(rpcs('info').length).toBe(2);
    for (const info of rpcs('info')) {
      expect(info.qs).not.toHaveProperty('settings');
    }
    expect(rpcs('deploy').map(r => r.qs.settings)).toEqual([mockSettings]);
  });

  test('the deploy token still reaches every call that needs it', async () => {
    load(galaxy());

    expect(await runDeploy()).toBe(0);

    for (const r of [...rpcs('info'), ...rpcs('deploy')]) {
      expect(r.qs.deployToken).toBe(DEPLOY_TOKEN);
      expect(r.qs.owner).toBe('synthetic-owner');
    }
  });

  test.each([
    ['a successful deploy', {}, 0],
    ['a failed deploy', { deployStatus: 500 }, 1],
  ])('%s never prints the settings or the token', async (_, opts, code) => {
    load(galaxy(opts));

    expect(await runDeploy()).toBe(code);

    expect(printedOutput()).not.toContain('synthetic-private-setting');
    expect(printedOutput()).not.toContain(DEPLOY_TOKEN);
  });
});
