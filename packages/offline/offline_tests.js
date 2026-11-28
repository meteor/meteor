import { Tinytest } from 'meteor/tinytest';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { Tracker } from 'meteor/tracker';
import { Offline } from 'meteor/offline';
import { Items, Amount } from './offline_tests_common.js';
import * as db from './db.js';
import { hydrate, mirror } from './mirror.js';
import { replay } from './queue.js';

const until = async (check, description) => {
  const deadline = Date.now() + 10_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

const collect = (type, into) => Offline.on(type, (event) => into.push(event));

// One start per page: the first test boots the engine on the test app's own
// connection, the others rely on it.
let startedOnce = null;
const started = () => {
  if (!startedOnce) {
    startedOnce = Offline.start({
      collections: [Items],
      methods: ['offline_test.insert', 'offline_test.setValue', 'offline_test.fail', 'offline_test.ping'],
      subscriptions: ['offline_test.items', 'offline_test.never_ready', 'offline_test.ready_on_demand', 'offline_test.ready_after'],
    }).then(() => new Promise((resolve) => Meteor.subscribe('offline_test.items', { onReady: resolve })));
  }
  return startedOnce;
};

Tinytest.addAsync('offline - start loads the copy, then the connection comes back', async function (test) {
  const events = [];
  const ready = collect('ready', events);
  try {
    await started();
    await until(() => Meteor.status().connected, 'the connection after start');
    test.isTrue(events.length <= 1, 'ready is reported at most once per start');
    await test.throwsAsync(() => Offline.start(), /already been called/);
  } finally {
    ready.stop();
  }
});

Tinytest.addAsync('offline - a call made while connected is recorded, then cleared on the result', async function (test) {
  await started();
  const events = [];
  const stops = [collect('method.queued', events), collect('method.done', events)];
  const _id = Random.id();
  try {
    await Meteor.callAsync('offline_test.insert', { _id, value: 'kept' });
    await until(async () => (await Offline.pending()).length === 0, 'the record to be cleared');
    const mine = events.filter((event) => event.name === 'offline_test.insert');
    test.equal(mine.map((event) => event.type), ['method.queued', 'method.done']);
    test.equal(mine[0].id, mine[1].id);
    test.equal(await Meteor.callAsync('offline_test.executions', _id), 1);
  } finally {
    stops.forEach((stop) => stop.stop());
  }
});

Tinytest.addAsync('offline - a call made while disconnected waits in the queue and is sent on reconnect', async function (test) {
  await started();
  const _id = Random.id();
  Meteor.disconnect();
  try {
    const call = Meteor.callAsync('offline_test.insert', { _id, value: 'queued' });
    await until(async () => (await Offline.pending()).length === 1, 'the record to be written');
    const [record] = await Offline.pending();
    test.equal(record.name, 'offline_test.insert');
    test.equal(record.args, [{ _id, value: 'queued' }]);
    test.equal(record.status, 'pending');
    test.equal(typeof record.queuedAt, 'number');
    Meteor.reconnect();
    await call;
    await until(async () => (await Offline.pending()).length === 0, 'the record to be cleared');
    test.equal(await Meteor.callAsync('offline_test.executions', _id), 1);
  } finally {
    Meteor.reconnect();
  }
});

Tinytest.addAsync('offline - a rejected call is kept as failed with its error, and can be dropped', async function (test) {
  await started();
  const events = [];
  const stops = [collect('method.failed', events), collect('method.dropped', events)];
  try {
    await test.throwsAsync(() => Meteor.callAsync('offline_test.fail'), /rejected on purpose/);
    await until(async () => (await Offline.failed()).length === 1, 'the record to be marked failed');
    const [record] = await Offline.failed();
    test.equal(record.name, 'offline_test.fail');
    test.equal(record.error.error, 'offline-test');
    test.equal(record.error.reason, 'rejected on purpose');
    test.equal(events.map((event) => event.type), ['method.failed']);
    test.equal(events[0].error.error, 'offline-test');
    test.equal((await Offline.pending()).length, 0, 'a failed call is not pending');

    await Offline.drop(record.id);
    test.equal((await Offline.failed()).length, 0);
    test.equal(events.map((event) => event.type), ['method.failed', 'method.dropped']);
    test.equal(events[1].id, record.id);
  } finally {
    stops.forEach((stop) => stop.stop());
  }
});

// What a previous page left behind: records the server never answered.
const leftBehind = (value, _id = Random.id()) =>
  db
    .put('calls', {
      id: Random.id(),
      name: 'offline_test.insert',
      args: JSON.stringify([{ _id, value }]),
      queuedAt: Date.now(),
      status: 'pending',
    })
    .then(() => _id);

Tinytest.addAsync('offline - a recorded call survives a reload, waits for the server and runs once', async function (test) {
  await started();
  const _id = await leftBehind('left behind');
  test.equal((await Offline.pending()).length, 1);
  Meteor.disconnect();
  try {
    test.equal(await replay(), 1, 'one call re-issued');
    test.equal(Items.findOne(_id).value, 'left behind', 'the stub put the document back');
    await new Promise((resolve) => setTimeout(resolve, 300));
    test.equal((await Offline.pending()).length, 1, 'still recorded while the server has not answered');
    Meteor.reconnect();
    await until(async () => (await Offline.pending()).length === 0, 'the replayed call to be answered');
  } finally {
    Meteor.reconnect();
  }
  test.equal(await Meteor.callAsync('offline_test.executions', _id), 1);
  // Once the server has answered, the document comes from the publication.
  await until(() => !!Items.findOne(_id), 'the inserted document to be published');
  test.equal(Items.findOne(_id).value, 'left behind');
});

Tinytest.addAsync('offline - recorded calls are replayed in order, one stub at a time', async function (test) {
  await started();
  const first = await leftBehind('first');
  await new Promise((resolve) => setTimeout(resolve, 5)); // distinct queuedAt
  const second = await leftBehind('second');
  test.equal(await replay(), 2);
  await until(async () => (await Offline.pending()).length === 0, 'both calls to be answered');
  test.equal(await Meteor.callAsync('offline_test.order', [first, second]), [first, second]);
  test.equal(await Meteor.callAsync('offline_test.executions', first), 1);
  test.equal(await Meteor.callAsync('offline_test.executions', second), 1);
});

Tinytest.addAsync('offline - calls made in the same millisecond are recorded in the order they were made', async function (test) {
  await started();
  const ids = Array.from({ length: 50 }, () => Random.id());
  let answered;
  Meteor.disconnect();
  try {
    answered = ids.map(
      (id) =>
        new Promise((resolve, reject) =>
          Meteor.apply('offline_test.ping', [id], (error) => (error ? reject(error) : resolve())),
        ),
    );
    await until(async () => (await Offline.pending()).length === ids.length, 'the records to be written');
    test.equal((await Offline.pending()).map((record) => record.args[0]), ids);
  } finally {
    Meteor.reconnect();
  }
  await Promise.all(answered);
  await until(async () => (await Offline.pending()).length === 0, 'the records to be cleared');
});

Tinytest.addAsync('offline - a recorded call of a Method no longer listed is re-issued once, then forgotten', async function (test) {
  await started();
  const _id = Random.id();
  const id = Random.id();
  // Left behind by a version of the app that listed this Method.
  await db.put('calls', {
    id,
    name: 'offline_test.nested',
    args: JSON.stringify([{ _id, value: 'no longer listed' }]),
    queuedAt: Date.now(),
    status: 'pending',
  });
  try {
    test.equal(await replay(), 1);
    await until(async () => (await Offline.pending()).length === 0, 'the replayed call to be answered');
    test.equal(await replay(), 0, 'nothing left for the next start');
  } finally {
    await db.remove('calls', id);
  }
  test.equal(await Meteor.callAsync('offline_test.executions', _id), 1);
});

Tinytest.addAsync('offline - a listed Method called from a stub is not recorded', async function (test) {
  await started();
  const events = [];
  const queued = collect('method.queued', events);
  const _id = Random.id();
  try {
    await Meteor.callAsync('offline_test.nested', { _id, value: 'nested' });
    test.equal(events.filter((event) => event.name === 'offline_test.insert').length, 0);
    test.equal((await Offline.pending()).length, 0);
    test.equal((await Offline.failed()).length, 0);
    test.equal(await Meteor.callAsync('offline_test.executions', _id), 1, 'the server ran it once, through the outer Method');
  } finally {
    queued.stop();
  }
});

Tinytest.addAsync('offline - applyAsync with a callback keeps the callback and settles the record', async function (test) {
  await started();
  const _id = Random.id();
  const result = await new Promise((resolve, reject) => {
    Meteor.connection.applyAsync('offline_test.insert', [{ _id, value: 'callback' }], (error, value) =>
      error ? reject(error) : resolve(value),
    );
  });
  test.isUndefined(result);
  await until(async () => (await Offline.pending()).length === 0, 'the record to be cleared');
  test.equal(await Meteor.callAsync('offline_test.executions', _id), 1);
});

Tinytest.addAsync('offline - Meteor.apply and Meteor.applyAsync record the call like Meteor.call does', async function (test) {
  await started();
  const pinged = Random.id();
  const inserted = Random.id();
  Meteor.disconnect();
  try {
    const ping = new Promise((resolve, reject) =>
      Meteor.apply('offline_test.ping', [pinged], (error) => (error ? reject(error) : resolve())),
    );
    const insert = Meteor.applyAsync('offline_test.insert', [{ _id: inserted, value: 'applyAsync' }], {
      returnServerResultPromise: true,
    });
    await until(async () => (await Offline.pending()).length === 2, 'both records to be written');
    const names = (await Offline.pending()).map((record) => record.name);
    test.equal(names.sort(), ['offline_test.insert', 'offline_test.ping']);
    Meteor.reconnect();
    await Promise.all([ping, insert]);
    await until(async () => (await Offline.pending()).length === 0, 'both records to be cleared');
  } finally {
    Meteor.reconnect();
  }
  test.equal(await Meteor.callAsync('offline_test.executions', pinged), 1);
  test.equal(await Meteor.callAsync('offline_test.executions', inserted), 1);
});

Tinytest.addAsync('offline - a stub exception with throwStubExceptions leaves no pending record', async function (test) {
  await started();
  await test.throwsAsync(
    () => Meteor.connection.applyAsync('offline_test.insert', [{ _id: 42 }], { throwStubExceptions: true }),
    /must be a string/,
  );
  await until(async () => (await Offline.failed()).length === 1, 'the record to be marked failed');
  const [record] = await Offline.failed();
  test.equal(record.error.error, 'offline-test-bad-id');
  test.equal((await Offline.pending()).length, 0, 'nothing left to replay');
  await Offline.drop(record.id);
});

Tinytest.addAsync('offline - a replayed update runs its stub against the loaded copy', async function (test) {
  await started();
  const _id = Random.id();
  // The copy holds the document; the queue holds an update to it.
  await db.put('documents', {
    key: `${Items._name}:${JSON.stringify(_id)}`,
    collection: Items._name,
    doc: JSON.stringify({ _id, value: 'old' }),
  });
  await db.put('calls', {
    id: Random.id(),
    name: 'offline_test.setValue',
    args: JSON.stringify([{ _id, value: 'new' }]),
    queuedAt: Date.now(),
    status: 'pending',
  });
  Meteor.disconnect();
  try {
    test.equal(await hydrate(Items), 1);
    test.equal(Items.findOne(_id).value, 'old');
    test.equal(await replay(), 1);
    test.equal(Items.findOne(_id).value, 'new', 'the stub updated the loaded document');
  } finally {
    Meteor.reconnect();
  }
  await until(async () => (await Offline.pending()).length === 0, 'the replayed call to be answered');
  await db.remove('documents', `${Items._name}:${JSON.stringify(_id)}`);
});

Tinytest.addAsync('offline - the copy follows Minimongo and is loaded back by hydrate', async function (test) {
  await started();
  // A local collection: Minimongo without a server behind it.
  const Local = new Mongo.Collection(`offline_test_local_${Random.id()}`, { connection: null });
  const handle = mirror(Local);
  const rows = async () => (await db.all('documents')).filter((row) => row.collection === Local._name);
  try {
    Local.insert({ _id: 'a', when: new Date(2026, 0, 1) });
    Local.insert({ _id: 'b', value: 1 });
    await until(async () => (await rows()).length === 2, 'both documents to be mirrored');
    Local.update('b', { $set: { value: 2 } });
    await until(async () => (await rows()).some((row) => row.doc.includes('"value":2')), 'the change to be mirrored');
    Local.remove('a');
    await until(async () => (await rows()).length === 1, 'the removal to be mirrored');
    Local.insert({ _id: 'a', when: new Date(2026, 0, 1) });
    await until(async () => (await rows()).length === 2, 'the document to be mirrored again');
  } finally {
    handle.stop();
  }
  // The next page starts with an empty Minimongo and loads the copy.
  Local.remove({});
  test.equal(Local.find().count(), 0);
  test.equal(await hydrate(Local), 2);
  test.equal(Local.find().count(), 2);
  test.instanceOf(Local.findOne('a').when, Date, 'EJSON keeps dates');
  test.equal(Local.findOne('b').value, 2);
  test.equal(await hydrate(Local), 0, 'documents already present are skipped');
});

Tinytest.addAsync('offline - ObjectID ids survive the copy and the recorded calls', async function (test) {
  await started();
  const Local = new Mongo.Collection(`offline_test_oid_${Random.id()}`, { connection: null });
  const _id = new Mongo.ObjectID();
  const handle = mirror(Local);
  const rows = async () => (await db.all('documents')).filter((row) => row.collection === Local._name);
  try {
    Local.insert({ _id, value: 'oid' });
    await until(async () => (await rows()).length === 1, 'the document to be mirrored');
  } finally {
    handle.stop();
  }
  Local.remove({});
  test.equal(await hydrate(Local), 1);
  test.instanceOf(Local.findOne()._id, Mongo.ObjectID);
  test.isTrue(Local.findOne()._id.equals(_id));
  test.isTrue(!!Local.findOne(_id), 'found by its ObjectID');
  Meteor.disconnect();
  try {
    const call = Meteor.callAsync('offline_test.setValue', { _id, value: 'oid' });
    await until(async () => (await Offline.pending()).length === 1, 'the record to be written');
    const [record] = await Offline.pending();
    test.instanceOf(record.args[0]._id, Mongo.ObjectID);
    test.isTrue(record.args[0]._id.equals(_id));
    Meteor.reconnect();
    await call;
    await until(async () => (await Offline.pending()).length === 0, 'the record to be cleared');
  } finally {
    Meteor.reconnect();
  }
});

Tinytest.addAsync('offline - a custom EJSON type survives the copy and the recorded calls', async function (test) {
  await started();
  const Local = new Mongo.Collection(`offline_test_amount_${Random.id()}`, { connection: null });
  const handle = mirror(Local);
  const rows = async () => (await db.all('documents')).filter((row) => row.collection === Local._name);
  try {
    Local.insert({ _id: 'a', amount: new Amount(1250) });
    await until(async () => (await rows()).length === 1, 'the document to be mirrored');
  } finally {
    handle.stop();
  }
  Local.remove({});
  test.equal(await hydrate(Local), 1);
  test.instanceOf(Local.findOne('a').amount, Amount);
  test.equal(Local.findOne('a').amount.cents, 1250);
  Meteor.disconnect();
  try {
    const call = Meteor.callAsync('offline_test.setValue', { _id: 'a', value: new Amount(99) });
    await until(async () => (await Offline.pending()).length === 1, 'the record to be written');
    const [record] = await Offline.pending();
    test.instanceOf(record.args[0].value, Amount);
    test.equal(record.args[0].value.cents, 99);
    Meteor.reconnect();
    await call;
    await until(async () => (await Offline.pending()).length === 0, 'the record to be cleared');
  } finally {
    Meteor.reconnect();
  }
});

Tinytest.addAsync('offline - clear empties the documents and the recorded calls', async function (test) {
  await started();
  await db.put('calls', { id: Random.id(), name: 'x', args: '[]', queuedAt: Date.now(), status: 'failed' });
  await db.put('documents', { key: 'x:"1"', collection: 'x', doc: '{"_id":"1"}' });
  await Offline.clear();
  test.equal(await db.all('calls'), []);
  test.equal(await db.all('documents'), []);
});

Tinytest.addAsync('offline - a login starts the user copy from Minimongo, a logout starts the anonymous copy empty', async function (test) {
  await started();
  const events = [];
  const ready = collect('ready', events);
  // Read at `ready`: a snapshot of Minimongo, if any, is written just before it.
  let anonymousRows;
  const probe = Offline.on('ready', ({ userId }) => {
    if (userId === null) anonymousRows = db.all('documents');
  });
  const anonymous = db.currentName();
  const exists = async (name) => (await indexedDB.databases()).some((database) => database.name === name);
  try {
    const _id = Random.id();
    await Meteor.callAsync('offline_test.insert', { _id, value: 'before login' });
    await new Promise((resolve, reject) =>
      Accounts.createUser({ username: Random.id(), password: 'offline-test' }, (error) => (error ? reject(error) : resolve())),
    );
    const userId = Meteor.userId();
    await until(() => events.some((event) => event.userId === userId), 'the user copy to start');
    test.equal(db.currentName(), db.nameFor(userId));
    test.isTrue((await db.all('documents')).some((row) => row.doc.includes(_id)), 'the user copy starts from Minimongo');
    await until(() => exists(anonymous).then((found) => !found), 'the anonymous copy to be deleted');
    await new Promise((resolve, reject) => Meteor.logout((error) => (error ? reject(error) : resolve())));
    await until(() => anonymousRows !== undefined, 'the anonymous copy to start');
    test.equal(db.currentName(), anonymous);
    test.equal(await anonymousRows, [], 'the documents of the previous user are not copied');
    await until(() => exists(db.nameFor(userId)).then((found) => !found), 'the user copy to be deleted');
  } finally {
    ready.stop();
    probe.stop();
  }
});

Tinytest.addAsync('offline - a subscription made without connection is ready from the copy, and stays ready', async function (test) {
  await started();
  // The device holds documents: the ones the subscription made at start published.
  await Meteor.callAsync('offline_test.insert', { _id: Random.id(), value: 'held' });
  await until(() => Items.find().count() > 0, 'a published document');
  const handles = [];
  let computation;
  Meteor.disconnect();
  try {
    const handle = Meteor.subscribe('offline_test.items', 'without connection');
    handles.push(handle);
    test.isFalse(handle.ready(), 'not ready synchronously');
    await until(() => handle.ready(), 'the subscription to be ready from the copy');
    test.isFalse(Meteor.status().connected);
    await new Promise((resolve) => handles.push(Meteor.subscribe('offline_test.items', 'with onReady', { onReady: resolve })));
    // An onReady that throws is reported, and its subscription is ready all
    // the same, for the computations too.
    Meteor._suppress_log(1);
    const throwing = Meteor.subscribe('offline_test.items', 'onReady throws', {
      onReady() {
        throw new Error('thrown by the app');
      },
    });
    handles.push(throwing);
    let seen = false;
    computation = Tracker.autorun(() => {
      seen = throwing.ready();
    });
    await until(() => seen, 'the computations to see the subscription ready');
    Meteor.reconnect();
    await until(() => Meteor.status().connected, 'the connection');
    test.isTrue(handle.ready(), 'still ready once connected');
    // With nothing on the device, a subscription waits for the server.
    await Meteor.callAsync('offline_test.clear');
    await until(() => Items.find().count() === 0, 'the documents to be withdrawn');
    Meteor.disconnect();
    // No deadline on the server's answer: a new session first publishes again
    // every subscription the test page holds, the other packages' included.
    let empty;
    const answered = new Promise((resolve) => {
      empty = Meteor.subscribe('offline_test.items', 'nothing held', { onReady: resolve });
    });
    handles.push(empty);
    await new Promise((resolve) => setTimeout(resolve, 100));
    test.isFalse(empty.ready(), 'waits for the server');
    Meteor.reconnect();
    await answered;
  } finally {
    Meteor.reconnect();
    if (computation) computation.stop();
    handles.forEach((handle) => handle.stop());
  }
});

// The messages of the package, counted while a test runs.
const counting = (fragment) => {
  const original = Meteor._debug;
  const seen = [];
  Meteor._debug = (message, ...rest) => {
    if (typeof message === 'string' && message.includes(fragment)) seen.push(message);
    else original(message, ...rest);
  };
  return { seen, stop: () => (Meteor._debug = original) };
};

// For what waits on the server after a reconnection: no 10-second deadline (a
// new session first publishes again every subscription the test page holds,
// which takes minutes in some CI modes), but a failure rather than a hang.
const within = (promise, description, timeout = 600_000) =>
  Promise.race([
    promise,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${description}`)), timeout)),
  ]);

// Resolves once handle.ready() is the given value.
const readyIs = (handle, value, description) =>
  within(
    new Promise((resolve) => {
      const watching = Tracker.autorun((current) => {
        if (handle.ready() !== value) return;
        current.stop();
        resolve();
      });
      if (watching.stopped) resolve();
    }),
    description,
  );

const held = async () => {
  await Meteor.callAsync('offline_test.insert', { _id: Random.id(), value: 'held' });
  await until(() => Items.find().count() > 0, 'a published document');
};

Tinytest.addAsync('offline - only a listed publication is ready from the copy', async function (test) {
  await started();
  await held();
  const handles = [];
  Meteor.disconnect();
  try {
    const listed = Meteor.subscribe('offline_test.items', 'listed');
    let unlisted;
    const unlistedAnswered = new Promise((resolve) => {
      unlisted = Meteor.subscribe('offline_test.unlisted', { onReady: resolve });
    });
    handles.push(listed, unlisted);
    await until(() => listed.ready(), 'the listed subscription to be ready from the copy');
    await new Promise((resolve) => setTimeout(resolve, 100));
    test.isFalse(unlisted.ready(), 'its data is not in the copy: it waits for the server');
    Meteor.reconnect();
    await within(unlistedAnswered, 'the server to answer the unlisted subscription');
    // Until the session starts, the status may already say connected: a
    // subscription made then is still made as without connection, ready from
    // the copy after a microtask, long before the server could answer it.
    Meteor.connection._resetStoresOnConnect = true;
    try {
      const early = Meteor.subscribe('offline_test.items', 'before the session');
      handles.push(early);
      await Promise.resolve();
      test.isTrue(early.ready(), 'made as without connection');
    } finally {
      Meteor.connection._resetStoresOnConnect = false;
    }
  } finally {
    Meteor.reconnect();
    handles.forEach((handle) => handle.stop());
  }
});

Tinytest.addAsync('offline - a listed publication that never answers is not waited for forever', async function (test) {
  await started();
  await held();
  const previous = Offline._setReadyTimeout(500);
  const messages = counting('[offline] no answer from');
  const handles = [];
  Meteor.disconnect();
  try {
    const handle = Meteor.subscribe('offline_test.never_ready');
    handles.push(handle);
    await until(() => handle.ready(), 'the subscription to be ready from the copy');
    Meteor.reconnect();
    // Answered once the copy is replaced: DDP holds the result's data until
    // every revived subscription is answered, and this one never is.
    const _id = Random.id();
    await within(Meteor.callAsync('offline_test.ping', _id), 'the call to be answered');
    test.equal(messages.seen.length, 1, 'given up once, and said so');
    test.isTrue(messages.seen[0].includes('offline_test.never_ready'));
    test.isFalse(handle.ready(), 'not ready: the server never said it was');
    // The same publication made again offline is not ready from the copy, and
    // the next session does not wait for either.
    Meteor.disconnect();
    const again = Meteor.subscribe('offline_test.never_ready');
    handles.push(again);
    await new Promise((resolve) => setTimeout(resolve, 100));
    test.isFalse(again.ready(), 'given up on: not made ready from the copy again');
    Meteor.reconnect();
    await within(Meteor.callAsync('offline_test.ping', _id), 'the second call to be answered');
    test.equal(await Meteor.callAsync('offline_test.executions', _id), 2);
    test.equal(messages.seen.length, 1, 'not waited for again');
  } finally {
    Meteor.reconnect();
    messages.stop();
    Offline._setReadyTimeout(previous);
    handles.forEach((handle) => handle.stop());
  }
});

Tinytest.addAsync('offline - a listed publication that answers after the wait is ready again, onReady called once', async function (test) {
  await started();
  await held();
  const previous = Offline._setReadyTimeout(300);
  const messages = counting('[offline] no answer from');
  const key = Random.id();
  let handle;
  let readyCalls = 0;
  Meteor.disconnect();
  try {
    handle = Meteor.subscribe('offline_test.ready_on_demand', key, { onReady: () => readyCalls++ });
    await until(() => handle.ready(), 'the subscription to be ready from the copy');
    test.equal(readyCalls, 1);
    Meteor.reconnect();
    await readyIs(handle, false, 'the wait to be given up');
    test.equal(messages.seen.length, 1);
    await within(Meteor.callAsync('offline_test.make_ready', key), 'the publication to be made ready');
    await readyIs(handle, true, 'the server to say the subscription is ready');
    test.equal(readyCalls, 1, 'the server ready does not call onReady again');
  } finally {
    Meteor.reconnect();
    messages.stop();
    Offline._setReadyTimeout(previous);
    if (handle) handle.stop();
  }
});

Tinytest.addAsync('offline - a subscription the server answered is not given up on in a later session', async function (test) {
  await started();
  await held();
  const messages = counting('[offline] no answer from');
  const key = Random.id();
  let handle;
  let stuck;
  let previous;
  Meteor.disconnect();
  try {
    handle = Meteor.subscribe('offline_test.ready_on_demand', key);
    await until(() => handle.ready(), 'the subscription to be ready from the copy');
    Meteor.reconnect();
    // Answered in this session, within the default wait.
    await within(Meteor.callAsync('offline_test.make_ready', key), 'the publication to be made ready');
    // The next session runs the publication again, and it holds the data back
    // longer than the wait: an ordinary slow reconnection, not the package's.
    // A subscription made ready from the copy meanwhile, whose publication
    // never answers, is not given up on while the other holds the data back:
    // that would not release anything.
    previous = Offline._setReadyTimeout(300);
    Meteor.disconnect();
    stuck = Meteor.subscribe('offline_test.never_ready', 'behind an ordinary wait');
    await until(() => stuck.ready(), 'the other subscription to be ready from the copy');
    Meteor.reconnect();
    await until(() => Meteor.status().connected, 'the connection');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    test.equal(messages.seen.length, 0, 'nothing given up on yet');
    test.isTrue(handle.ready());
    test.isTrue(stuck.ready(), 'still ready while another subscription holds the data back');
    await within(Meteor.callAsync('offline_test.make_ready', key), 'the publication to be made ready again');
    test.equal(messages.seen.length, 1, 'given up on once alone');
    test.isTrue(messages.seen[0].includes('offline_test.never_ready'));
    test.isFalse(messages.seen[0].includes('offline_test.ready_on_demand'));
    test.isFalse(stuck.ready());
  } finally {
    Meteor.reconnect();
    messages.stop();
    if (previous !== undefined) Offline._setReadyTimeout(previous);
    if (handle) handle.stop();
    if (stuck) stuck.stop();
  }
});

Tinytest.addAsync('offline - the wait starts once only the copy holds the data back', async function (test) {
  await started();
  await held();
  // Checks every second: a check falls between the end of the slow call and
  // the publication's answer, which comes before the wait counted from there.
  const previous = Offline._setReadyTimeout(2000);
  const messages = counting('[offline] no answer from');
  let handle;
  Meteor.disconnect();
  try {
    handle = Meteor.subscribe('offline_test.ready_after', 1500);
    await until(() => handle.ready(), 'the subscription to be ready from the copy');
    Meteor.reconnect();
    // Sent before the subscription, run first on the server: the publication
    // starts once the call is over, 3 seconds after the socket opens.
    await within(Meteor.callAsync('offline_test.sleep', 3000), 'the slow call');
    test.equal(messages.seen.length, 0, 'the publication had not started: not given up on');
    test.isTrue(handle.ready());
  } finally {
    Meteor.reconnect();
    messages.stop();
    Offline._setReadyTimeout(previous);
    if (handle) handle.stop();
  }
});
