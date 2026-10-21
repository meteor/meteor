const mockSessionToken = 'synthetic-meteor-account-session-token';

jest.mock('request', () => jest.fn(), { virtual: true });
jest.mock('../fs/files', () => ({
  inCheckout: () => true,
  getToolsVersion: () => 'test',
  readFile: () => '',
  OfflineError: class OfflineError extends Error {},
}));
jest.mock('../packaging/release.js', () => ({ current: null }));
jest.mock('../utils/utils.js', () => ({ timeoutScaleFactor: 1 }));
jest.mock('../utils/buildmessage.js', () => ({}));
jest.mock('../tool-env/profile', () => ({ Profile: (name, fn) => fn }));
jest.mock('./stats.js', () => ({ recordPackages: () => {} }));
jest.mock('./config.js', () => ({ getAccountsDomain: () => 'www.meteor.com' }));
jest.mock('./auth.js', () => ({
  getSessionId: () => null,
  getSessionToken: () => mockSessionToken,
  setSessionId: () => {},
  loggedInUsername: () => 'synthetic-user',
  isLoggedIn: () => true,
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

const DEFAULT_DEPLOY_URL = 'https://us-east-1.galaxy-deploy.meteor.com';
const GALAXY_DEPLOY_URLS = [
  DEFAULT_DEPLOY_URL,
  'https://eu-west-1.galaxy-deploy.meteor.com',
  'https://ap-southeast-2.galaxy-deploy.meteor.com',
];
const SITE = 'victim.example';
const DISCOVERY_PATH = '/.well-known/meteor/deploy-url';

let deploy;
let Console;
let wire;

// Mock discovery while recording every deploy RPC.
function load({ discovery }) {
  jest.resetModules();
  wire = [];
  const request = require('request');
  request.mockImplementation((options, callback) => {
    wire.push({
      url: options.url,
      method: options.method || 'GET',
      headers: { ...options.headers },
    });

    if (options.url.endsWith(DISCOVERY_PATH)) {
      const answer = discovery(options.url);
      process.nextTick(() => {
        if (answer.error) {
          callback(answer.error);
        } else {
          callback(null, { statusCode: answer.statusCode, headers: {} },
            answer.body);
        }
      });
      return {};
    }

    process.nextTick(() => callback(null, {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }, '{}'));
    return {};
  });
  deploy = require('./deploy.js');
  Console = require('../console/console.js').Console;
}

function galaxyAnswer(deployURL) {
  return () => ({
    statusCode: 200,
    body: { galaxyDiscoveryVersion: 'galaxy-1', deployURL },
  });
}

function rpcRequests() {
  return wire.filter(r => ! r.url.endsWith(DISCOVERY_PATH));
}

function requestsWithToken() {
  return wire.filter(r => r.headers['X-Meteor-Auth'] === mockSessionToken);
}

function errorOutput() {
  return Console.error.mock.calls.map(args => args.join(' ')).join('\n');
}

function expectTokenOnlySentToGalaxy() {
  for (const r of requestsWithToken()) {
    expect(GALAXY_DEPLOY_URLS.some(base => r.url.startsWith(`${base}/`)))
      .toBe(true);
  }
}

describe('Galaxy discovery (MET-009)', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DEPLOY_HOSTNAME;
    delete process.env.CAFILE;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe('default Galaxy flows keep working', () => {
    test.each(GALAXY_DEPLOY_URLS)('discovery selecting %s', async url => {
      load({ discovery: galaxyAnswer(url) });

      expect(await deploy.listAuthorized(SITE)).toBe(0);

      expect(wire[0].url).toBe(`https://${SITE}${DISCOVERY_PATH}`);
      expect(wire[0].headers['X-Meteor-Auth']).toBeUndefined();
      expect(rpcRequests().map(r => r.url)).toEqual([`${url}/info/${SITE}`]);
      expect(rpcRequests()[0].headers['X-Meteor-Auth']).toBe(mockSessionToken);
    });

    test('discovery selecting an uppercase Galaxy host', async () => {
      load({ discovery: galaxyAnswer('HTTPS://US-EAST-1.GALAXY-DEPLOY.METEOR.COM') });

      expect(await deploy.listAuthorized(SITE)).toBe(0);

      expect(rpcRequests().map(r => r.url))
        .toEqual([`${DEFAULT_DEPLOY_URL}/info/${SITE}`]);
      expectTokenOnlySentToGalaxy();
    });

    test('a site without a certificate is found over http', async () => {
      // Galaxy has no certificate for an app that does not exist yet, so a
      // first deploy to another region is only discovered over http.
      load({
        discovery: url => url.startsWith('https://')
          ? { error: new Error('synthetic TLS failure') }
          : galaxyAnswer(GALAXY_DEPLOY_URLS[1])(),
      });

      expect(await deploy.listAuthorized(SITE)).toBe(0);

      expect(wire.filter(r => r.url.endsWith(DISCOVERY_PATH)).map(r => r.url))
        .toEqual([`https://${SITE}${DISCOVERY_PATH}`, `http://${SITE}${DISCOVERY_PATH}`]);
      expect(rpcRequests().map(r => r.url))
        .toEqual([`${GALAXY_DEPLOY_URLS[1]}/info/${SITE}`]);
      expectTokenOnlySentToGalaxy();
    });

    test('http is not tried when https discovery answers', async () => {
      load({ discovery: galaxyAnswer(GALAXY_DEPLOY_URLS[1]) });

      expect(await deploy.listAuthorized(SITE)).toBe(0);

      expect(wire.filter(r => r.url.startsWith('http://'))).toEqual([]);
    });

    test('a site that is not on Galaxy uses the default server', async () => {
      load({ discovery: () => ({ statusCode: 404, body: 'Not found' }) });

      expect(await deploy.listAuthorized(SITE)).toBe(0);

      expect(rpcRequests().map(r => r.url))
        .toEqual([`${DEFAULT_DEPLOY_URL}/info/${SITE}`]);
      expectTokenOnlySentToGalaxy();
    });

    test('commands without a site use the default server', async () => {
      load({ discovery: galaxyAnswer('https://collector.attacker.example') });

      await deploy.listSites();

      expect(wire.map(r => r.url))
        .toEqual([`${DEFAULT_DEPLOY_URL}/authorized-apps`]);
      expectTokenOnlySentToGalaxy();
    });
  });

  describe('attack routes', () => {
    test('route 1: discovery selecting an attacker https server', async () => {
      load({ discovery: galaxyAnswer('https://collector.attacker.example') });

      const status = await deploy.listAuthorized(SITE);

      expect(requestsWithToken()).toEqual([]);
      expect(rpcRequests()).toEqual([]);
      expect(status).toBe(1);
      expect(errorOutput()).toMatch(/not a Galaxy deploy server/);
      expect(errorOutput()).toMatch(/DEPLOY_HOSTNAME/);
    });

    test('route 2: plaintext discovery selecting an attacker server', async () => {
      load({
        discovery: url => url.startsWith('https://')
          ? { error: new Error('synthetic TLS failure') }
          : galaxyAnswer('https://collector.attacker.example')(),
      });

      const status = await deploy.listAuthorized(SITE);

      expect(requestsWithToken()).toEqual([]);
      expect(rpcRequests()).toEqual([]);
      expect(status).toBe(1);
      expect(errorOutput()).toMatch(/not a Galaxy deploy server/);
    });

    test('route 2: failed https and http discovery use the default server', async () => {
      load({ discovery: () => ({ error: new Error('synthetic network failure') }) });

      expect(await deploy.listAuthorized(SITE)).toBe(0);

      expect(rpcRequests().map(r => r.url))
        .toEqual([`${DEFAULT_DEPLOY_URL}/info/${SITE}`]);
      expectTokenOnlySentToGalaxy();
    });

    test.each([
      'http://collector.attacker.example',
      'http://us-east-1.galaxy-deploy.meteor.com',
    ])('route 3: https discovery selecting plaintext %s', async url => {
      load({ discovery: galaxyAnswer(url) });

      const status = await deploy.listAuthorized(SITE);

      expect(requestsWithToken()).toEqual([]);
      expect(rpcRequests()).toEqual([]);
      expect(status).toBe(1);
    });

    test.each([
      'https://us-east-1.galaxy-deploy.meteor.com.attacker.example',
      'https://attacker.example#@us-east-1.galaxy-deploy.meteor.com',
      'https://us-east-1.galaxy-deploy.meteor.com@attacker.example',
      'https://us-east-1.galaxy-deploy.meteor.com:8443',
      'https://evilgalaxy-deploy.meteor.com',
      'https://galaxy-deploy.meteor.com.attacker.example',
      'https://galaxy-deploy.meteor.com@attacker.example',
      'https://us-east-1.galaxy-deploy.meteor.com.',
      '//us-east-1.galaxy-deploy.meteor.com',
      'us-east-1.galaxy-deploy.meteor.com',
    ])('lookalike deploy URL %s is rejected', async url => {
      load({ discovery: galaxyAnswer(url) });

      const status = await deploy.listAuthorized(SITE);

      expect(requestsWithToken()).toEqual([]);
      expect(rpcRequests()).toEqual([]);
      expect(status).toBe(1);
    });

    test.each([null, 42, { href: DEFAULT_DEPLOY_URL }])(
      'non-string deploy URL %p is rejected', async url => {
        load({ discovery: galaxyAnswer(url) });

        const status = await deploy.listAuthorized(SITE);

        expect(requestsWithToken()).toEqual([]);
        expect(status).toBe(1);
      });
  });

  describe('DEPLOY_HOSTNAME escape hatch', () => {
    test('an explicitly configured server skips discovery', async () => {
      process.env.DEPLOY_HOSTNAME = 'galaxy.internal.example';
      load({ discovery: galaxyAnswer('https://collector.attacker.example') });

      expect(await deploy.listAuthorized(SITE)).toBe(0);

      expect(wire.map(r => r.url))
        .toEqual([`https://galaxy.internal.example/info/${SITE}`]);
      expect(wire[0].headers['X-Meteor-Auth']).toBe(mockSessionToken);
    });

    test('localhost keeps its http default for local testing', async () => {
      process.env.DEPLOY_HOSTNAME = 'localhost:5500';
      load({ discovery: galaxyAnswer(DEFAULT_DEPLOY_URL) });

      expect(await deploy.listAuthorized(SITE)).toBe(0);

      expect(wire.map(r => r.url))
        .toEqual([`http://localhost:5500/info/${SITE}`]);
    });
  });
});

describe('trustedGalaxyDeployURL', () => {
  beforeAll(() => {
    load({ discovery: () => ({ statusCode: 404, body: '' }) });
  });

  test.each([
    ...GALAXY_DEPLOY_URLS.map(url => [url, url]),
    ['https://sa-east-1.galaxy-deploy.meteor.com',
      'https://sa-east-1.galaxy-deploy.meteor.com'],
    ['https://galaxy-deploy.meteor.com', 'https://galaxy-deploy.meteor.com'],
    [`${DEFAULT_DEPLOY_URL}/`, DEFAULT_DEPLOY_URL],
    [`${DEFAULT_DEPLOY_URL}:443`, DEFAULT_DEPLOY_URL],
    ['HTTPS://EU-WEST-1.GALAXY-DEPLOY.METEOR.COM', GALAXY_DEPLOY_URLS[1]],
    ['https://Us-East-1.Galaxy-Deploy.Meteor.Com', DEFAULT_DEPLOY_URL],
    ['HTTPS://GALAXY-DEPLOY.METEOR.COM', 'https://galaxy-deploy.meteor.com'],
    [`${GALAXY_DEPLOY_URLS[2]}/api`, `${GALAXY_DEPLOY_URLS[2]}/api`],
  ])('accepts %s', (input, expected) => {
    expect(deploy.trustedGalaxyDeployURL(input)).toBe(expected);
  });

  test.each([
    'http://us-east-1.galaxy-deploy.meteor.com',
    'https://collector.attacker.example',
    'https://us-east-1.galaxy-deploy.meteor.com.attacker.example',
    'https://user:pass@us-east-1.galaxy-deploy.meteor.com',
    'https://us-east-1.galaxy-deploy.meteor.com:8443',
    'https://evilgalaxy-deploy.meteor.com',
    'https://galaxy-deploy.meteor.com.attacker.example',
    'https://galaxy-deploy.meteor.com@attacker.example',
    'https://galaxy-deploy.meteor.com.',
    'https://us-east-1.galaxy-deploy.meteor.com.',
    'https://EVILGALAXY-DEPLOY.METEOR.COM',
    'https://meteor.com',
    'not a url',
    '',
    undefined,
  ])('rejects %p', input => {
    expect(deploy.trustedGalaxyDeployURL(input)).toBe(null);
  });
});
