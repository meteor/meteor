const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual nested coordinator without mocking the entire CLI runtime.
// The architecture-entrypoints E2E suite covers its wiring to the real watcher.
const filename = path.join(__dirname, 'run-app.js');
const source = ts.createSourceFile(
  filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true,
  ts.ScriptKind.JS,
);
let coordinator;
function findCoordinator(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'runPostStartupCallbacks') {
    coordinator = node.getText(source);
  }
  ts.forEachChild(node, findCoordinator);
}
findCoordinator(source);
if (!coordinator) throw new Error('Missing runPostStartupCallbacks coordinator');

function session({ watchForChanges = true, canRefreshClient = true } = {}) {
  const bundleResult = { clientWatchSet: { files: { modern: 'initial' } } };
  const errors = [];
  const messages = { hasMessages: () => errors.length > 0 };
  const subscriptions = [Object.keys(bundleResult.clientWatchSet.files)];
  const setupClientWatcher = jest.fn(() => {
    subscriptions.push(Object.keys(bundleResult.clientWatchSet.files));
  });
  const buildmessage = {
    capture: jest.fn(async (options, callback) => {
      await callback();
      return messages;
    }),
    error: message => errors.push(message),
  };
  const run = vm.runInNewContext(`(${coordinator})`, {
    self: { watchForChanges }, canRefreshClient, setupClientWatcher,
    buildmessage, pauseClient: jest.fn(), refreshClient: jest.fn(), runLog: {},
  }, { filename });
  return { run, bundleResult, subscriptions, setupClientWatcher, buildmessage, messages, errors };
}

test('rearms after delayed dependencies are added, on startup and subsequent refreshes', async () => {
  const { run, bundleResult, subscriptions } = session();

  for (const file of ['legacy', 'newLegacyDependency']) {
    let finishBuild;
    const building = new Promise(resolve => { finishBuild = resolve; });
    bundleResult.postStartupCallbacks = [async () => {
      bundleResult.clientWatchSet.files[file] = 'new';
      await building;
    }];

    const previousSubscriptions = subscriptions[subscriptions.length - 1];
    const pending = run(bundleResult);
    // Keep the existing subscriptions while the delayed build is in progress.
    expect(subscriptions[subscriptions.length - 1]).toBe(previousSubscriptions);
    expect(previousSubscriptions).not.toContain(file);

    finishBuild();
    await expect(pending).resolves.toBeUndefined();
    expect(subscriptions[subscriptions.length - 1]).toEqual(
      Object.keys(bundleResult.clientWatchSet.files),
    );
  }
  expect(subscriptions).toHaveLength(3);
});

test.each([
  { watchForChanges: false, canRefreshClient: true },
  { watchForChanges: true, canRefreshClient: false },
])('does not create a client watcher when refresh is disabled: %j', async options => {
  const { run, bundleResult, setupClientWatcher } = session(options);
  const callback = jest.fn();
  bundleResult.postStartupCallbacks = [callback];
  await run(bundleResult);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(setupClientWatcher).not.toHaveBeenCalled();
});

test('preserves callback failure reporting without rearming', async () => {
  const { run, bundleResult, setupClientWatcher, messages, errors } = session();
  bundleResult.postStartupCallbacks = [() => { throw new Error('delayed build failed'); }];
  await expect(run(bundleResult)).resolves.toEqual({
    outcome: 'bundle-fail', errors: messages, watchSet: bundleResult.clientWatchSet,
  });
  expect(errors).toEqual(['delayed build failed']);
  expect(setupClientWatcher).not.toHaveBeenCalled();
});

test.each([undefined, []])('does not rearm without delayed callbacks: %j', async callbacks => {
  const { run, bundleResult, setupClientWatcher } = session();
  bundleResult.postStartupCallbacks = callbacks;
  await run(bundleResult);
  expect(setupClientWatcher).not.toHaveBeenCalled();
});
