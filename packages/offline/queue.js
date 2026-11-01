import { Meteor } from 'meteor/meteor';
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
let wrapped = false;

export function configure(methods, onEvent) {
  allowed = new Set(methods);
  emit = onEvent;
  if (!wrapped) {
    wrap(Meteor.connection);
    wrapped = true;
  }
}

function wrap(connection) {
  const { apply, applyAsync } = connection;

  connection.apply = function (name, args, options, callback) {
    if (!allowed.has(name)) return apply.call(this, name, args, options, callback);
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    return apply.call(this, name, args, recording(name, args, options), callback);
  };

  connection.applyAsync = function (name, args, options, callback) {
    if (!allowed.has(name)) return applyAsync.call(this, name, args, options, callback);
    return applyAsync.call(this, name, args, recording(name, args, options), callback);
  };
}

// Records the call and returns the options that settle the record on the
// server's answer, keeping the caller's own onResultReceived if any.
function recording(name, args, options = {}) {
  const record = track(name, args);
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

const errorToJSON = (error) => ({ error: error.error, reason: error.reason, message: error.message });

function settle({ id, name, stored }, error) {
  stored
    .then(async () => {
      if (!error) {
        await db.remove('calls', id);
        emit('method.done', { id, name });
        return;
      }
      const record = await db.get('calls', id);
      if (!record) return; // dropped by the app in the meantime
      await db.put('calls', { ...record, status: 'failed', error: errorToJSON(error) });
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
