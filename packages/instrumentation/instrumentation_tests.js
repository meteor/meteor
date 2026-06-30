import { Tinytest } from 'meteor/tinytest';
import { Meteor } from 'meteor/meteor';
import { Instrumentation } from 'meteor/instrumentation';
import { makeTestConnection } from 'meteor/test-helpers';

Meteor.methods({
  'instr_test.echo': async (x) => x * 2,
  'instr_test.boom': async () => { throw new Meteor.Error('nope', 'on purpose'); },
  'instr_test.bigError': () => { throw new Meteor.Error('big', 'x'.repeat(1000000)); },
  'instr_test.ctx': function () { return Instrumentation.currentContext(); },
  'instr_test.captured': function (data) { return data; },
  // A method literally named `login` is treated as the Accounts login by the
  // hard-coded denylist — args/result must never be captured.
  'login': function (creds) { return 'ok'; },
});

const collect = (type, into) => Instrumentation.on(type, (e) => into.push(e));

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
    await Meteor.callAsync('login', { password: 'secret' });
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
