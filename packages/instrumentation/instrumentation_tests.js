import { Tinytest } from 'meteor/tinytest';
import { Meteor } from 'meteor/meteor';
import { Instrumentation } from 'meteor/instrumentation';
import { makeTestConnection } from 'meteor/test-helpers';

// What the instr_test.mutate handler actually SAW — proves projector mutations
// of the args never reach the handler.
const mutateSeen = [];

Meteor.methods({
  'instr_test.echo': async (x) => x * 2,
  'instr_test.boom': async () => { throw new Meteor.Error('nope', 'on purpose'); },
  'instr_test.bigError': () => { throw new Meteor.Error('big', 'x'.repeat(1000000)); },
  'instr_test.ctx': function () { return Instrumentation.currentContext(); },
  'instr_test.mutate': async (obj) => { mutateSeen.push(obj.value); return { value: obj.value }; },
  'instr_test.captured': function (data) { return data; },
  // An application error whose `reason` getter throws: building its preview must
  // not break the reply path (the caller still gets THIS error, not the getter's).
  'instr_test.evilError': () => {
    const err = new Meteor.Error('evil-original', 'legit reason');
    Object.defineProperty(err, 'reason', { get() { throw new Error('reason getter boom'); } });
    throw err;
  },
});

// A method literally named `login` is treated as the Accounts login by the
// hard-coded denylist — args/result must never be captured. In the
// all-packages test app (test-in-console) accounts-base already defines
// `login`, and a duplicate registration crashes the server at boot; the
// denylist test then exercises the real login method instead.
try {
  Meteor.methods({ 'login': function (creds) { return 'ok'; } });
} catch (e) {
  // already defined by accounts-base
}

const collect = (type, into) => Instrumentation.on(type, (e) => into.push(e));

// Promisified makeTestConnection, keeping BOTH ends (the test-helpers
// createTestConnectionPromise resolves with the client side only).
const connect = (test) => new Promise((resolve) => {
  makeTestConnection(test, (clientConn, serverConn) => resolve([clientConn, serverConn]));
});

Tinytest.addAsync('instrumentation - method start/end events + traceId consistency', async function (test) {
  const events = [];
  const a = collect('method.start', events);
  const b = collect('method.end', events);
  try {
    test.equal(await Meteor.callAsync('instr_test.echo', 21), 42);
    const start = events.find((e) => e.type === 'method.start' && e.name === 'instr_test.echo');
    const end = events.find((e) => e.type === 'method.end' && e.name === 'instr_test.echo');
    test.isTrue(!!start, 'method.start emitted');
    test.isTrue(!!end, 'method.end emitted');
    test.equal(start.traceId, end.traceId);
    test.isTrue(typeof start.traceId === 'string' && start.traceId.length > 0, 'traceId is set');
    test.equal(start.argsCount, 1);
    test.isUndefined(start.args);            // not captured by default
    test.isTrue(typeof end.durationMs === 'number', 'durationMs set on end');
  } finally { a.stop(); b.stop(); }
});

Tinytest.addAsync('instrumentation - currentContext matches the start event', async function (test) {
  const events = [];
  const a = collect('method.start', events);
  try {
    const handlerCtx = await Meteor.callAsync('instr_test.ctx');
    const start = events.find((e) => e.name === 'instr_test.ctx');
    test.equal(handlerCtx.kind, 'method');
    test.isTrue(typeof handlerCtx.traceId === 'string' && handlerCtx.traceId.length > 0);
    test.equal(start.traceId, handlerCtx.traceId);   // the consistency guarantee
    test.isNull(handlerCtx.connectionId);            // server-initiated callAsync
  } finally { a.stop(); }
});

Tinytest.addAsync('instrumentation - method error event (sanitized)', async function (test) {
  const errors = [];
  const a = collect('method.error', errors);
  try {
    let threw = false;
    try { await Meteor.callAsync('instr_test.boom'); } catch (_e) { threw = true; }
    test.isTrue(threw, 'method threw');
    const err = errors.find((e) => e.name === 'instr_test.boom');
    test.isTrue(!!err, 'method.error emitted');
    test.equal(err.error.error, 'nope');
    test.equal(err.error.reason, 'on purpose');
  } finally { a.stop(); }
});

Tinytest.addAsync('instrumentation - Accounts denylist suppresses args, others can be captured', async function (test) {
  Instrumentation.configure({ captureMethodArgs: 'preview' });
  const seen = {};
  const a = Instrumentation.on('method.start', (e) => { seen[e.name] = e; });
  try {
    // The real accounts `login` (all-packages test app) rejects these fake
    // credentials — irrelevant here: method.start fires either way, and the
    // denylist must redact the args in both worlds.
    await Meteor.callAsync('login', { password: 'secret' }).then(() => {}, () => {});
    await Meteor.callAsync('instr_test.captured', { hello: 'world' });
    test.isUndefined(seen['login'].args, 'login args suppressed by denylist');
    test.equal(seen['login'].argsCount, 1);
    test.isTrue(!!seen['instr_test.captured'].args, 'non-denylisted args captured');
    test.equal(seen['instr_test.captured'].args[0].hello, 'world');
  } finally {
    a.stop();
    Instrumentation.configure({ captureMethodArgs: false });
  }
});

Tinytest.addAsync('instrumentation - eventPrefix sets eventName, not the canonical type', async function (test) {
  Instrumentation.configure({ eventPrefix: 'myapp' });
  let ev;
  const a = Instrumentation.on('method.start', (e) => { if (e.name === 'instr_test.echo') ev = e; });
  try {
    await Meteor.callAsync('instr_test.echo', 1);
    test.equal(ev.type, 'method.start');
    test.equal(ev.eventName, 'myapp.method.start');
  } finally {
    a.stop();
    Instrumentation.configure({ eventPrefix: '' });
  }
});

Tinytest.addAsync('instrumentation - a throwing listener never breaks the method', async function (test) {
  const a = Instrumentation.on('method.start', () => { throw new Error('listener boom'); });
  try {
    test.equal(await Meteor.callAsync('instr_test.echo', 3), 6);  // method still succeeds
  } finally { a.stop(); }
});

Tinytest.addAsync('instrumentation - listeners registered during an emission do not receive the current event', async function (test) {
  const calls = [];
  const added = [];
  let off2 = null;
  const off1 = Instrumentation.on('method.start', (e) => {
    if (e.name !== 'instr_test.echo') return;
    calls.push('outer');
    if (!off2) {
      off2 = Instrumentation.on('method.start', (e2) => {
        if (e2.name !== 'instr_test.echo') return;
        added.push('inner');
      });
    }
  });
  try {
    await Meteor.callAsync('instr_test.echo', 2);
    test.equal(calls.length, 1, 'outer listener ran once');
    test.equal(added.length, 0, 'a listener added mid-emission must not see the current event');
    await Meteor.callAsync('instr_test.echo', 2);
    test.equal(added.length, 1, 'it does see subsequent events');
  } finally { off1.stop(); if (off2) off2.stop(); }
});

Tinytest.addAsync('instrumentation - an error with throwing getters still reaches the caller intact', async function (test) {
  const events = [];
  const a = collect('method.error', events);
  try {
    let caught = null;
    try { await Meteor.callAsync('instr_test.evilError'); } catch (e) { caught = e; }
    test.isTrue(!!caught, 'the caller received an error');
    test.equal(caught && caught.error, 'evil-original', 'the ORIGINAL application error reached the caller');
    const ev = events.find((e) => e.name === 'instr_test.evilError');
    test.isTrue(!!ev, 'method.error was still emitted (degraded, not dropped)');
    test.equal(ev && ev.error && ev.error.error, 'evil-original', 'the readable fields survived');
  } finally { a.stop(); }
});

Tinytest.addAsync('instrumentation - a payload-build failure is reported, never propagated', async function (test) {
  const reported = [];
  Instrumentation.configure({ captureMethodArgs: 'preview', onListenerError: (err) => reported.push(err) });
  const events = [];
  const a = Instrumentation.on('method.start', (e) => { if (e.name === 'instr_test.echo') events.push(e); });
  try {
    // The benign custom clone() bypasses the framework's own EJSON.clone of
    // applyAsync args; previewValue still walks into the proxy, whose ownKeys
    // trap throws — failing OUR payload build and nothing else.
    const evil = {
      clone: () => ({}),
      inner: new Proxy({}, { ownKeys() { throw new Error('ownKeys boom'); } }),
    };
    test.equal(await Meteor.callAsync('instr_test.echo', 5, evil), 10, 'the method call succeeded untouched');
    test.equal(events.length, 0, 'the unbuildable event was dropped, not half-delivered');
    test.isTrue(reported.length > 0, 'the build failure was reported to onListenerError');
    test.equal(reported[0] && reported[0].message, 'ownKeys boom');
  } finally {
    a.stop();
    Instrumentation.configure({ captureMethodArgs: false, onListenerError: null });
  }
});

Tinytest.addAsync('instrumentation - configure({ enabled:false }) silences emission, listeners aside', async function (test) {
  const events = [];
  const a = collect('method.start', events);
  try {
    Instrumentation.configure({ enabled: false });
    test.equal(await Meteor.callAsync('instr_test.echo', 7), 14);
    test.equal(events.length, 0, 'no events while disabled, even with a listener registered');

    Instrumentation.configure({ enabled: true });
    await Meteor.callAsync('instr_test.echo', 8);
    test.isTrue(events.some((e) => e.name === 'instr_test.echo'), 'emission resumes once re-enabled');
  } finally {
    a.stop();
    Instrumentation.configure({ enabled: true });
  }
});

Tinytest.addAsync('instrumentation - method.error bounds oversized Meteor.Error strings', async function (test) {
  const errors = [];
  const a = collect('method.error', errors);
  try {
    try { await Meteor.callAsync('instr_test.bigError'); } catch (_e) { /* expected */ }
    const err = errors.find((e) => e.name === 'instr_test.bigError');
    test.isTrue(!!err, 'method.error emitted');
    test.equal(err.error.error, 'big');
    test.isTrue(err.error.reason.length <= 201, `reason should be bounded, got ${err.error.reason.length}`);
    test.isTrue(err.error.reason.endsWith('…'), 'reason was truncated');
  } finally { a.stop(); }
});

Tinytest.addAsync('instrumentation - previews bound key names, bigints and getter failure messages', async function (test) {
  Instrumentation.configure({ captureMethodArgs: 'preview' });
  const events = [];
  const a = collect('method.start', events);
  try {
    // clone() bypasses the framework's EJSON.clone of the args (which tolerates
    // neither bigints nor throwing getters); the preview walk sees everything.
    const payload = { clone: () => ({}), ['k'.repeat(10000)]: 1, big: 10n ** 500n };
    Object.defineProperty(payload, 'trap', {
      enumerable: true,
      get() { throw new Error('x'.repeat(10000)); },
    });
    test.equal(await Meteor.callAsync('instr_test.echo', 5, payload), 10);
    const ev = events.find((e) => e.name === 'instr_test.echo');
    const arg = ev && ev.args && ev.args[1];
    test.isTrue(!!arg, 'the payload preview was captured');
    test.isTrue(Object.keys(arg).every((k) => k.length <= 201), 'key names are bounded');
    test.isTrue(String(arg.big).length <= 210, 'bigint rendering is bounded');
    test.isTrue(String(arg.trap).length <= 250, 'the getter-failure marker is bounded');
  } finally {
    a.stop();
    Instrumentation.configure({ captureMethodArgs: false });
  }
});

// A publication homonymous with a name someone passed to configureMethod:
// per-method projectors are method-scoped by contract and must never run here.
Meteor.publish('instr_test.homonym', function (arg) {
  this.ready();
});

Tinytest.addAsync(
  'instrumentation - configureMethod does not leak to a same-named publication',
  function (test, onComplete) {
    Instrumentation.configureMethod('instr_test.homonym', { captureArgs: () => ({ leaked: true }) });
    const events = [];
    const off = Instrumentation.on('publication.start', (e) => { if (e.name === 'instr_test.homonym') events.push(e); });
    makeTestConnection(test, (clientConn) => {
      clientConn.subscribe('instr_test.homonym', 'secret-arg', {
        onReady: () => {
          off.stop();
          Instrumentation.configureMethod('instr_test.homonym', {});
          test.equal(events.length, 1, 'publication.start emitted');
          test.isUndefined(events[0] && events[0].args, 'a method-scoped projector must not capture publication args');
          clientConn.disconnect();
          onComplete();
        },
      });
    });
  }
);

Tinytest.addAsync('instrumentation - a configureMethod projector cannot mutate the live call', async function (test) {
  Instrumentation.configureMethod('instr_test.mutate', {
    captureArgs: (args) => { args[0].value = 'TAMPERED-ARGS'; return { projected: args[0].value }; },
    captureResult: (result) => { result.value = 'TAMPERED-RESULT'; return { projected: result.value }; },
  });
  const events = [];
  const a = collect('method.start', events);
  const b = collect('method.end', events);
  mutateSeen.length = 0;
  try {
    const result = await Meteor.callAsync('instr_test.mutate', { value: 'original' });
    test.equal(mutateSeen[0], 'original', 'the handler saw the original args');
    test.equal(result.value, 'original', 'the caller got the untouched result');
    const start = events.find((e) => e.type === 'method.start' && e.name === 'instr_test.mutate');
    const end = events.find((e) => e.type === 'method.end' && e.name === 'instr_test.mutate');
    test.equal(start && start.args && start.args.projected, 'TAMPERED-ARGS', 'the projector worked on its own copy');
    test.equal(end && end.result && end.result.projected, 'TAMPERED-RESULT', 'the result projector too');
  } finally {
    a.stop(); b.stop();
    Instrumentation.configureMethod('instr_test.mutate', {});
  }
});

// The two tests below go through a REAL DDP connection: methods received from a
// client run through Session.method (the protocol handler), a different code
// path from the server-initiated Server.apply the tests above exercise. They
// pin the seam's hooks on that path, so a botched hook re-placement (e.g. while
// rebasing over a refactored livedata_server.js) fails loudly here.
Tinytest.addAsync('instrumentation - DDP client method call emits start/end on the session path', async function (test) {
  const events = [];
  const a = collect('method.start', events);
  const b = collect('method.end', events);
  try {
    const [clientConn, serverConn] = await connect(test);
    test.equal(await clientConn.callAsync('instr_test.echo', 21), 42);
    const start = events.find((e) => e.type === 'method.start' && e.name === 'instr_test.echo' && e.connectionId === serverConn.id);
    const end = events.find((e) => e.type === 'method.end' && e.name === 'instr_test.echo' && e.connectionId === serverConn.id);
    test.isTrue(!!start, 'method.start emitted on the DDP session path');
    test.isTrue(!!end, 'method.end emitted on the DDP session path');
    test.equal(start.traceId, end.traceId);
    test.equal(start.argsCount, 1);
    test.equal(typeof end.durationMs, 'number');
    clientConn.disconnect();
  } finally { a.stop(); b.stop(); }
});

Tinytest.addAsync('instrumentation - DDP client method error emits method.error and still reaches the client', async function (test) {
  const events = [];
  const c = collect('method.error', events);
  try {
    const [clientConn, serverConn] = await connect(test);
    let clientErr = null;
    try { await clientConn.callAsync('instr_test.boom'); } catch (e) { clientErr = e; }
    test.isTrue(!!clientErr, 'the client still received the error reply');
    test.equal(clientErr.error, 'nope');
    const ev = events.find((e) => e.name === 'instr_test.boom' && e.connectionId === serverConn.id);
    test.isTrue(!!ev, 'method.error emitted on the DDP session path');
    test.equal(ev.error && ev.error.error, 'nope');
    clientConn.disconnect();
  } finally { c.stop(); }
});

// A publication whose handler calls this.error(). On the error path the
// subscription tears down (error → _stopSubscription → _deactivate), which must
// emit ONE terminal event — publication.error — not also publication.stop.
Meteor.publish('instr_test.brokenPub', function () {
  this.error(new Meteor.Error('pub-fail', 'on purpose'));
});

Tinytest.addAsync(
  'instrumentation - publication.error is the only terminal event (no duplicate stop)',
  function (test, onComplete) {
    const terminal = [];
    const onErr = Instrumentation.on('publication.error', (e) => {
      if (e.name === 'instr_test.brokenPub') terminal.push('error');
    });
    const onStop = Instrumentation.on('publication.stop', (e) => {
      if (e.name === 'instr_test.brokenPub') terminal.push('stop');
    });
    makeTestConnection(test, (clientConn) => {
      clientConn.subscribe('instr_test.brokenPub', {
        onStop: () => {
          onErr.stop();
          onStop.stop();
          // Both server-side emissions ran before the client received the nosub.
          test.equal(terminal, ['error'], 'single terminal event: error, not error+stop');
          clientConn.disconnect();
          onComplete();
        },
      });
    });
  }
);

// The mirror of the above: a normal teardown must still emit publication.stop
// (and never publication.error) — guards the error-path flag from suppressing
// legitimate stops.
Meteor.publish('instr_test.okPub', function () {
  this.stop();
});

Tinytest.addAsync(
  'instrumentation - normal teardown emits publication.stop, never error',
  function (test, onComplete) {
    const terminal = [];
    const onErr = Instrumentation.on('publication.error', (e) => {
      if (e.name === 'instr_test.okPub') terminal.push('error');
    });
    const onStop = Instrumentation.on('publication.stop', (e) => {
      if (e.name === 'instr_test.okPub') terminal.push('stop');
    });
    makeTestConnection(test, (clientConn) => {
      clientConn.subscribe('instr_test.okPub', {
        onStop: () => {
          onErr.stop();
          onStop.stop();
          test.equal(terminal, ['stop'], 'single terminal event: stop, not error');
          clientConn.disconnect();
          onComplete();
        },
      });
    });
  }
);

// clientAddress is PII (the client IP) and must be opt-in: absent from
// ddp.connection.open by default, present only after configure({ captureClientAddress: true }).
Tinytest.addAsync(
  'instrumentation - clientAddress is absent from connection.open by default',
  function (test, onComplete) {
    const opens = [];
    const off = Instrumentation.on('ddp.connection.open', (e) => opens.push(e));
    makeTestConnection(test, (clientConn, serverConn) => {
      off.stop();
      const ev = opens.find((e) => e.connectionId === serverConn.id);
      test.isTrue(!!ev, 'ddp.connection.open emitted for the new connection');
      test.isUndefined(ev.clientAddress, 'clientAddress is not captured unless opted in');
      clientConn.disconnect();
      onComplete();
    });
  }
);

Tinytest.addAsync(
  'instrumentation - clientAddress is captured once opted in',
  function (test, onComplete) {
    Instrumentation.configure({ captureClientAddress: true });
    const opens = [];
    const off = Instrumentation.on('ddp.connection.open', (e) => opens.push(e));
    makeTestConnection(test, (clientConn, serverConn) => {
      off.stop();
      Instrumentation.configure({ captureClientAddress: false }); // restore default
      const ev = opens.find((e) => e.connectionId === serverConn.id);
      test.isTrue(!!ev, 'ddp.connection.open emitted for the new connection');
      test.equal(typeof ev.clientAddress, 'string', 'clientAddress is a string when opted in');
      clientConn.disconnect();
      onComplete();
    });
  }
);

// onListenerError: a configured handler must receive (error, event) when a
// listener throws — the failure is reported, never propagated to the caller.
Tinytest.addAsync(
  'instrumentation - configure({ onListenerError }) receives listener failures',
  async function (test) {
    const caught = [];
    Instrumentation.configure({ onListenerError: (err, event) => caught.push({ err, event }) });
    const a = Instrumentation.on('method.start', () => { throw new Error('listener kaboom'); });
    try {
      await Meteor.callAsync('instr_test.echo', 21);
      const hit = caught.find((c) => c.event && c.event.name === 'instr_test.echo' && c.event.type === 'method.start');
      test.isTrue(!!hit, 'onListenerError handler was invoked');
      test.equal(hit.err.message, 'listener kaboom');
    } finally {
      a.stop();
      Instrumentation.configure({ onListenerError: null }); // restore: no handler
    }
  }
);
