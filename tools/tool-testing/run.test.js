import Run from './run.js';

jest.mock('../fs/files', () => ({
  convertToOSPath: value => value,
  convertToStandardPath: value => value,
  getCurrentToolsDir: () => '.',
}));
jest.mock('../utils/parse-stack', () => ({
  parse: () => ({ outsideFiber: [] }),
}));
jest.mock('../console/console.js', () => ({
  Console: {
    simpleDebug: jest.fn(),
    error: jest.fn(),
    options: jest.fn(),
    arrowError: jest.fn(),
    rawError: jest.fn(),
    success: jest.fn(),
  },
}));
jest.mock('../utils/utils.js', () => ({ timeoutScaleFactor: 1 }));
jest.mock('../utils/processes', () => ({}));
jest.mock('./test-utils.js', () => ({ markThrowingMethods: () => {} }));

function createTest() {
  const cleanups = [];
  return {
    onCleanup: callback => cleanups.push(callback),
    cleanup: async () => {
      for (const callback of cleanups.splice(0)) await callback();
    },
  };
}

function startRun() {
  const run = new Run(process.execPath, {
    args: ['-e', 'process.stdin.once("data", () => process.exit(1)); process.stdout.write("ready\\n");'],
  });
  run.baseTimeout = 5;
  return run;
}

test('an exited child with a pending output match can be retried without crashing', async () => {
  const testList = { notifyFailed: jest.fn() };
  const testCase = createTest();
  let attempts = 0;

  await Run.runTest(testList, testCase, async () => {
    attempts++;
    const run = startRun();
    await run.match('ready');
    run.baseTimeout = 0.1;
    const missingOutput = run.match('never printed');
    run.write('exit\n');
    await missingOutput;
  }, { retries: 1 });
  await new Promise(resolve => setImmediate(resolve));

  expect(attempts).toBe(2);
  expect(testList.notifyFailed).toHaveBeenCalledTimes(1);
  expect(testList.notifyFailed.mock.calls[0][1].reason).toBe('match-timeout');
});

test('expectExit still reports the output match failure after child exit', async () => {
  const testList = { notifyFailed: jest.fn() };
  await Run.runTest(testList, createTest(), async () => {
    const run = startRun();
    await run.match('ready');
    run.baseTimeout = 0.1;
    const missingOutput = run.match('never printed');
    run.write('exit\n');
    await expect(missingOutput).rejects.toMatchObject({ reason: 'match-timeout' });
    await expect(run.expectExit(1)).rejects.toMatchObject({ reason: 'match-timeout' });
  });
  expect(testList.notifyFailed).not.toHaveBeenCalled();
});

test('a successful output match and expected exit still pass', async () => {
  const testList = { notifyFailed: jest.fn() };
  await Run.runTest(testList, createTest(), async () => {
    const run = startRun();
    await run.match('ready');
    run.write('exit\n');
    await run.expectExit(1);
  });
  expect(testList.notifyFailed).not.toHaveBeenCalled();
});
