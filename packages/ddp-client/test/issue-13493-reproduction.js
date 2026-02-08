import { Connection } from '../common/livedata_connection.js';

// Test for issue #13493: Verify that removing subscriptions doesn't cause
// unnecessary reactive invalidations of ready state watchers.
Tinytest.addAsync(
  'livedata connection - issue 13493 - unnecessary reactive invalidations on subscription removal',
  async function(test) {
    const stream = new StubStream();
    const conn = new Connection(stream, {
      reloadWithOutstanding: true,
      bufferedWritesInterval: 0
    });

    // Initialize connection
    await stream.reset();
    stream.sent.shift(); // discard connect message
    await stream.receive({ msg: 'connected', session: 'test-session' });
    test.length(stream.sent, 0);

    let readyComputationRuns = 0;
    const limit = new ReactiveVar(5);
    const subscriptionHandles = [];
    
    const markAllReady = async function() {
      const subIds = [];
      for (let msg of stream.sent) {
        const parsed = JSON.parse(msg);
        if (parsed.msg === 'sub') {
          subIds.push(parsed.id);
        }
      }
      stream.sent = [];
      if (subIds.length > 0) {
        await stream.receive({ msg: 'ready', subs: subIds });
      }
    };

    const subAutorun = Tracker.autorun(() => {
      const currentLimit = limit.get();
      subscriptionHandles.length = 0;
      for (let i = 0; i < currentLimit; ++i) {
        subscriptionHandles.push(conn.subscribe('myPub', i));
      }
    });

    Tracker.flush();
    await markAllReady();
    Tracker.flush();


    const readyAutorun = Tracker.autorun(() => {
      readyComputationRuns++;
      const ready = subscriptionHandles.every(h => h.ready());
    });

    Tracker.flush();
    const initialRuns = readyComputationRuns;

    limit.set(3);
    Tracker.flush();
    await markAllReady();
    Tracker.flush();

    test.equal(
      readyComputationRuns,
      initialRuns + 1,
      `Expected ${initialRuns + 1} runs, got ${readyComputationRuns}`
    );


    limit.set(10);
    Tracker.flush();
    await markAllReady();
    Tracker.flush();

    const runsBeforeDecrease = readyComputationRuns;
    
    limit.set(2);
    Tracker.flush();
    await markAllReady();
    Tracker.flush();

    const additionalRuns = readyComputationRuns - runsBeforeDecrease;
    test.equal(
      additionalRuns,
      1,
      `Expected 1 additional run, got ${additionalRuns}`
    );


    subAutorun.stop();
    readyAutorun.stop();
  }
);
