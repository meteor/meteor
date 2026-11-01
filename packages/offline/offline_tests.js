import { Tinytest } from 'meteor/tinytest';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { Offline } from 'meteor/offline';
import { Items } from './offline_tests_common.js';
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
      methods: ['offline_test.insert', 'offline_test.fail'],
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

Tinytest.addAsync('offline - clear empties the documents and the recorded calls', async function (test) {
  await started();
  await db.put('calls', { id: Random.id(), name: 'x', args: '[]', queuedAt: Date.now(), status: 'failed' });
  await db.put('documents', { key: 'x:"1"', collection: 'x', doc: '{"_id":"1"}' });
  await Offline.clear();
  test.equal(await db.all('calls'), []);
  test.equal(await db.all('documents'), []);
});
