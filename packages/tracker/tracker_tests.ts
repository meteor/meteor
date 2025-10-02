import { Tinytest } from "meteor/tinytest";
import { Tracker } from "meteor/tracker";

Tinytest.add("Tracker - TypeScript types - autorun returns Computation", (test) => {
  const computation: Tracker.Computation = Tracker.autorun((c) => {
    const comp: Tracker.Computation = c;
    test.equal(typeof comp.firstRun, "boolean");
  });

  computation.stop();
  test.equal(computation.stopped, true);
});

Tinytest.add("Tracker - TypeScript types - Computation properties", (test) => {
  const computation = Tracker.autorun((c) => {
    const firstRun: boolean = c.firstRun;
    const invalidated: boolean = c.invalidated;
    const stopped: boolean = c.stopped;
    const promise: Promise<unknown> = c.firstRunPromise;

    test.equal(typeof firstRun, "boolean");
    test.equal(typeof invalidated, "boolean");
    test.equal(typeof stopped, "boolean");
    test.equal(promise instanceof Promise, true);
  });

  computation.stop();
});

Tinytest.add("Tracker - TypeScript types - Computation methods", (test) => {
  const computation = Tracker.autorun(() => {});

  computation.invalidate();
  test.equal(computation.invalidated, true);

  computation.onInvalidate((c: Tracker.Computation) => {
    test.equal(typeof c, "object");
  });

  computation.onStop((c: Tracker.Computation) => {
    test.equal(typeof c, "object");
  });

  computation.stop();
});

Tinytest.add("Tracker - TypeScript types - Dependency", (test) => {
  const dep: Tracker.Dependency = new Tracker.Dependency();

  const hasDeps: boolean = dep.hasDependents();
  test.equal(typeof hasDeps, "boolean");

  const computation = Tracker.autorun(() => {
    const didDepend: boolean = dep.depend();
    test.equal(typeof didDepend, "boolean");
  });

  dep.changed();
  computation.stop();
});

Tinytest.add("Tracker - TypeScript types - currentComputation", (test) => {
  const outsideComp: Tracker.Computation | null = Tracker.currentComputation;
  test.equal(outsideComp, null);

  Tracker.autorun(() => {
    const insideComp: Tracker.Computation | null = Tracker.currentComputation;
    test.equal(insideComp !== null, true);
  });
});

Tinytest.add("Tracker - TypeScript types - active", (test) => {
  const outsideActive: boolean = Tracker.active;
  test.equal(outsideActive, false);

  Tracker.autorun(() => {
    const insideActive: boolean = Tracker.active;
    test.equal(insideActive, true);
  });
});

Tinytest.add("Tracker - TypeScript types - afterFlush", (test) => {
  let called = false;

  Tracker.afterFlush(() => {
    called = true;
  });

  Tracker.flush();
  test.equal(called, true);
});

Tinytest.add("Tracker - TypeScript types - flush", (test) => {
  const dep = new Tracker.Dependency();
  let runCount = 0;

  Tracker.autorun(() => {
    dep.depend();
    runCount++;
  });

  dep.changed();
  test.equal(runCount, 1); // Not flushed yet

  Tracker.flush();
  test.equal(runCount, 2); // Now flushed
});

Tinytest.add("Tracker - TypeScript types - nonreactive", (test) => {
  const dep = new Tracker.Dependency();
  let runCount = 0;

  Tracker.autorun(() => {
    runCount++;
    const result: number = Tracker.nonreactive(() => {
      dep.depend(); // This should NOT create a dependency
      return 42;
    });
    test.equal(result, 42);
  });

  dep.changed();
  Tracker.flush();
  test.equal(runCount, 1); // Should not have rerun
});

Tinytest.add("Tracker - TypeScript types - onInvalidate", (test) => {
  const dep = new Tracker.Dependency();
  let invalidateCount = 0;

  const computation = Tracker.autorun(() => {
    dep.depend();
    Tracker.onInvalidate(() => {
      invalidateCount++;
    });
  });

  dep.changed();
  Tracker.flush();
  test.equal(invalidateCount, 1);

  computation.stop();
});

Tinytest.add("Tracker - TypeScript types - autorun with onError option", (test) => {
  let errorCaught = false;

  const computation = Tracker.autorun(
    () => {
      throw new Error("Test error");
    },
    {
      onError: (err: Error) => {
        errorCaught = true;
        test.equal(err.message, "Test error");
      },
    }
  );

  test.equal(errorCaught, true);
  computation.stop();
});

Tinytest.addAsync("Tracker - TypeScript types - withComputation", async (test, done) => {
  const computation = Tracker.autorun(() => {});

  const result: string = await Tracker.withComputation(computation, async () => {
    return "async result";
  });

  test.equal(result, "async result");
  computation.stop();
  done();
});

Tinytest.addAsync("Tracker - TypeScript types - firstRunPromise", async (test, done) => {
  const computation = Tracker.autorun((c) => {});

  const promise: Promise<unknown> = computation.firstRunPromise;
  await promise;

  test.equal(computation.firstRun, false);
  computation.stop();
  done();
});
