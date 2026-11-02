import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp-client';
import { EJSON } from 'meteor/ejson';
import { Random } from 'meteor/random';
import * as db from './db.js';

// The persisted Method queue. Meteor already keeps an in-memory queue and
// re-sends unanswered calls when the connection comes back; a record here only
// has to survive a page unload, so it is written when the call is made and
// settled when the server answers, through the `onResultReceived` option that
// Meteor calls for every call whatever the caller's own promise or callback.
let allowed = new Set();
let emit = () => {};
let replaying = null; // id of the record being re-issued by replay()

export function configure(methods, onEvent) {
  allowed = new Set(methods);
  emit = onEvent;
}

// A call made from inside a stub never reaches the server on its own: Meteor
// runs it as part of the enclosing simulation.
function inSimulation() {
  const invocation = DDP._CurrentMethodInvocation.get();
  return !!(invocation && invocation.isSimulation);
}

const recordedApply = (apply) =>
  function (name, args, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (!allowed.has(name) || inSimulation()) return apply.call(this, name, args, options, callback);
    const record = track(name, args);
    try {
      return apply.call(this, name, args, recording(record, options), callback);
    } catch (error) {
      // A stub exception with throwStubExceptions: the call is not sent.
      settle(record, error);
      throw error;
    }
  };

const recordedApplyAsync = (applyAsync) =>
  function (name, args, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (!allowed.has(name) || inSimulation()) return applyAsync.call(this, name, args, options, callback);
    const record = track(name, args);
    const promise = applyAsync.call(this, name, args, recording(record, options), callback);
    if (options && options.throwStubExceptions) {
      // serverPromise is a separate promise object: handling it here leaves
      // the caller's own rejection handling untouched.
      promise.serverPromise.then(null, (error) => settle(record, error));
    }
    return promise;
  };

// Installed when the package loads, before the app's code and the packages
// that keep a reference to these functions. Meteor.call and Meteor.callAsync
// go through the connection's apply and applyAsync; Meteor.apply and
// Meteor.applyAsync were bound to the original ones when ddp-client loaded,
// so they are wrapped on their own.
const connection = Meteor.connection;
connection.apply = recordedApply(connection.apply);
connection.applyAsync = recordedApplyAsync(connection.applyAsync);
Meteor.apply = recordedApply(Meteor.apply);
Meteor.applyAsync = recordedApplyAsync(Meteor.applyAsync);

// The options that settle the record on the server's answer, keeping the
// caller's own onResultReceived if any.
function recording(record, options = {}) {
  const { onResultReceived } = options;
  return {
    ...options,
    onResultReceived(error, result) {
      settle(record, error);
      if (onResultReceived) onResultReceived(error, result);
    },
  };
}

function track(name, args) {
  if (replaying) return { id: replaying, name, stored: Promise.resolve() };
  const id = Random.id();
  const record = { id, name, args: EJSON.stringify(args), queuedAt: Date.now(), status: 'pending' };
  const stored = db.put('calls', record).catch(db.warn);
  emit('method.queued', { id, name });
  return { id, name, stored };
}

function errorToJSON(error) {
  const json = { error: error.error, reason: error.reason, message: error.message };
  if (error.details !== undefined) {
    try {
      json.details = EJSON.clone(error.details);
    } catch {
      // Left out: the copy must stay storable.
    }
  }
  return json;
}

function settle(record, error) {
  if (record.settled) return;
  record.settled = true;
  const { id, name, stored } = record;
  stored
    .then(async () => {
      if (!error) {
        await db.remove('calls', id);
        emit('method.done', { id, name });
        return;
      }
      const stored = await db.get('calls', id);
      if (!stored) return; // dropped by the app in the meantime
      await db.put('calls', { ...stored, status: 'failed', error: errorToJSON(error) });
      emit('method.failed', { id, name, error });
    })
    .catch(db.warn);
}

const byQueueOrder = (a, b) => a.queuedAt - b.queuedAt;
const withArgs = (record) => ({ ...record, args: EJSON.parse(record.args) });

async function records(status) {
  return (await db.all('calls')).filter((record) => record.status === status).sort(byQueueOrder);
}

// Re-issues the recorded calls through Meteor, oldest first. Their stubs put
// the optimistic documents back and Meteor sends them once connected. One stub
// at a time: a call started while another stub is still running would be taken
// for a nested stub call and never reach the server.
export async function replay(connection = Meteor.connection) {
  const pendingRecords = await records('pending');
  for (const record of pendingRecords) {
    replaying = record.id;
    let promise;
    try {
      promise = connection.callAsync(record.name, ...EJSON.parse(record.args));
    } finally {
      replaying = null;
    }
    // The failure, if any, is recorded and reported by settle().
    promise.catch(() => {});
    await promise.stubPromise.catch(() => {});
  }
  return pendingRecords.length;
}

export const pending = async () => (await records('pending')).map(withArgs);
export const failed = async () => (await records('failed')).map(withArgs);

export async function drop(id) {
  await db.remove('calls', id);
  emit('method.dropped', { id });
}
