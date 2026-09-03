import { Connection } from '../common/livedata_connection.js';

Tinytest.addAsync(
  'livedata connection - subscription ready reactive invalidations',
  async function(test) {
    const stream = new StubStream();
    const conn = new Connection(stream, {
      reloadWithOutstanding: true,
      bufferedWritesInterval: 0
    });

    await stream.reset();
    stream.sent.shift();
    await stream.receive({ msg: 'connected', session: 'test-session' });
    test.length(stream.sent, 0);

    let runs = 0;
    const limit = new ReactiveVar(5);
    const handles = [];

    const markAllReady = async function() {
      const subIds = [];
      for (let msg of stream.sent) {
        const parsed = JSON.parse(msg);
        if (parsed.msg === 'sub') subIds.push(parsed.id);
      }
      stream.sent = [];
      if (subIds.length > 0) {
        await stream.receive({ msg: 'ready', subs: subIds });
      }
    };

    const subAutorun = Tracker.autorun(() => {
      const currentLimit = limit.get();
      handles.length = 0;
      for (let i = 0; i < currentLimit; ++i) {
        handles.push(conn.subscribe('myPub', i));
      }
    });

    Tracker.flush();
    await markAllReady();
    Tracker.flush();

    const readyAutorun = Tracker.autorun(() => {
      runs++;
      handles.every(h => h.ready());
    });

    Tracker.flush();
    const initialRuns = runs;

    limit.set(3);
    Tracker.flush();
    await markAllReady();
    Tracker.flush();
    test.equal(runs, initialRuns + 1);

    limit.set(10);
    Tracker.flush();
    await markAllReady();
    Tracker.flush();

    const before = runs;
    limit.set(2);
    Tracker.flush();
    await markAllReady();
    Tracker.flush();
    test.equal(runs - before, 1);

    subAutorun.stop();
    readyAutorun.stop();
    Tracker.flush();
  }
);
