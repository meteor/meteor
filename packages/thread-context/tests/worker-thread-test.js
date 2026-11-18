import { createThreadContext } from 'meteor/thread-context';
import { Worker } from 'worker_threads';

if (Meteor.isServer) {

const collName = 'thread_context_worker_thread_test';
const WorkerThreadCol = new Mongo.Collection(collName);

// Runs inside a real worker_threads Worker, which has no Meteor module
// system: the worker-side API is loaded the way an app would load it, by
// importing the entry module the package ships (workerData.bridgeModuleUrl).
// The worker's only work is the two awaited bridge calls: if the bridge does
// not keep the worker's event loop alive while a call is in flight, the
// worker exits before posting.
const WORKER_SOURCE = `
const { workerData, parentPort } = require('worker_threads');
(async () => {
  const bridge = await import(workerData.bridgeModuleUrl);
  const { Collections, Meteor } = bridge.hydrateContext(workerData);
  const docs = await Collections[workerData.collName].find({}, { sort: { order: 1 } }).fetchAsync();
  const echo = await Meteor.callAsync('threadContext.bridge.echo', 'from-worker');
  parentPort.postMessage({
    docs,
    echo,
    userId: Meteor.userId(),
    exports: Object.keys(bridge).sort(),
  });
})().catch((err) => {
  parentPort.postMessage({ error: String((err && err.stack) || err) });
});
`;

function runWorker(ctx) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON'],
      workerData: { ...ctx.workerData, collName },
      transferList: [ctx.port],
    });

    let message = null;
    worker.on('message', (msg) => { message = msg; });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (!message) {
        reject(new Error(`Worker exited with code ${code} before posting a result`));
      } else if (message.error) {
        reject(new Error(message.error));
      } else {
        resolve(message);
      }
    });
  });
}

Tinytest.addAsync('thread-context - worker thread - stays alive until bridge calls resolve', async function (test) {
  await WorkerThreadCol.removeAsync({});
  await WorkerThreadCol.insertAsync({ _id: 'w1', order: 2 });
  await WorkerThreadCol.insertAsync({ _id: 'w2', order: 1 });

  const ctx = createThreadContext({ userId: 'worker-user', callTimeout: 5000 });
  try {
    const result = await runWorker(ctx);
    test.equal(result.docs.map((doc) => doc._id), ['w2', 'w1']);
    test.equal(result.echo.val, 'from-worker');
    test.equal(result.echo.userId, 'worker-user');
    test.equal(result.userId, 'worker-user');
    // The entry module also exposes the error classes, so workers can use
    // instanceof checks without access to 'meteor/thread-context'.
    test.equal(result.exports, [
      'BridgeContextError',
      'BridgeError',
      'BridgeSerializationError',
      'BridgeTimeoutError',
      'MeteorError',
      'hydrateContext',
    ]);
  } finally {
    ctx.destroy();
  }
});

} // end Meteor.isServer
