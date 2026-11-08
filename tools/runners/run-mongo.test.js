const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

jest.mock('../fs/files', () => ({
  pathJoin: require('node:path').join,
  getDevBundle: () => '/dev-bundle',
  convertToOSPath: value => value,
  mkdir_p: jest.fn(),
  readFile: () => '3101',
  writeFile: jest.fn(),
}));
jest.mock('../utils/utils.js', () => ({}));
jest.mock('../utils/mongo-exit-codes', () => ({ MongoExitCodes: {} }));
jest.mock('../utils/fiber-helpers.js', () => ({
  bindEnvironment: callback => callback,
}));
jest.mock('../tool-env/cleanup.js', () => ({ onExit: jest.fn() }));
jest.mock('../tool-env/isopackets.js', () => ({ loadIsopackage: jest.fn() }));
jest.mock('./run-log.js', () => ({ log: jest.fn() }));
jest.mock('../console/console.js', () => ({ Console: {} }));
jest.mock('child_process', () => ({ spawn: jest.fn() }));

const { MongoRunner } = require('./run-mongo');
const { loadIsopackage } = require('../tool-env/isopackets.js');
const { spawn } = require('child_process');

const readyOutput = [
  'Waiting for connections',
  'Did not find local replica set configuration document at startup',
];

function prepareRunner() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = jest.fn();
  spawn.mockReturnValue(child);
  const runner = new MongoRunner({ projectLocalDir: '/app/.meteor/local', port: 3101 });
  // Avoid OS process discovery; this test exercises the spawned child's lifecycle.
  runner.firstStart = false;
  runner._exited = jest.fn();
  return { child, runner };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test.each([0, 1, 2])('exit after %i readiness messages cancels startup and ignores late stdout', async count => {
  const { child, runner } = prepareRunner();
  const startup = runner._startOrRestart();
  const queuedStdout = child.stdout.listeners('data')[0];
  expect(queuedStdout).toEqual(expect.any(Function));
  for (const message of readyOutput.slice(0, count)) child.stdout.emit('data', message);

  child.emit('exit', 48, null);
  // Node can deliver buffered stdout after exit. Also exercise a callback
  // already queued before the listener was removed.
  expect(() => {
    child.stdout.emit('data', readyOutput.join('\n'));
    queuedStdout(readyOutput.join('\n'));
  }).not.toThrow();

  await startup;
  expect(runner.handle).toBeNull();
  expect(child.stdout.listenerCount('data')).toBe(0);
  expect(child.kill).not.toHaveBeenCalled();
  expect(loadIsopackage).not.toHaveBeenCalled();
  expect(runner._exited).toHaveBeenCalledWith(48, null, '', {});
});

test('a live process completes replica set startup and can be stopped once', async () => {
  const command = jest.fn().mockResolvedValue({ ismaster: true });
  const client = {
    connect: jest.fn().mockResolvedValue(undefined),
    db: () => ({ admin: () => ({ command }) }),
    close: jest.fn(),
  };
  loadIsopackage.mockResolvedValue({
    NpmModuleMongodb: { MongoClient: jest.fn().mockImplementation(() => client) },
  });
  const { child, runner } = prepareRunner();
  const startup = runner._startOrRestart();
  child.stdout.emit('data', readyOutput.join('\n'));
  await startup;

  expect(runner.handle).not.toBeNull();
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ isMaster: 1 }));
  expect(child.stdout.listenerCount('data')).toBe(0);
  runner.stop();
  runner.stop();
  expect(child.kill).toHaveBeenCalledTimes(1);
  expect(child.kill).toHaveBeenCalledWith('SIGINT');
  expect(child.listenerCount('exit')).toBe(0);
});
