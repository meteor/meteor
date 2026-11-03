import { Retry } from "./retry.js";

const noop = () => {};

Tinytest.add("retry - retryLater with count < minCount returns minTimeout", (test) => {
  const retry = new Retry({ minCount: 3, minTimeout: 42 });
  try {
    test.equal(retry.retryLater(0, noop), 42);
    retry.clear();
    test.equal(retry.retryLater(1, noop), 42);
    retry.clear();
    test.equal(retry.retryLater(2, noop), 42);
  } finally {
    retry.clear();
  }
});

Tinytest.add("retry - retryLater with count >= minCount respects fuzz bounds", (test) => {
  const retry = new Retry({
    baseTimeout: 1000,
    exponent: 2,
    fuzz: 0.5,
    minCount: 0,
    maxTimeout: 1e9,
  });

  // Unfuzzed value at count=2 is 1000 * 2^2 = 4000.
  // Fuzz factor: random * 0.5 + 0.75 ∈ [0.75, 1.25].
  // Admissible window: [3000, 5000].
  try {
    for (let i = 0; i < 20; i++) {
      const timeout = retry.retryLater(2, noop);
      retry.clear();
      test.isTrue(
        timeout >= 3000 && timeout <= 5000,
        `sample ${i}: expected [3000, 5000], got ${timeout}`,
      );
    }
  } finally {
    retry.clear();
  }
});

Tinytest.add("retry - retryLater caps at maxTimeout", (test) => {
  const retry = new Retry({
    maxTimeout: 100,
    baseTimeout: 1000,
    exponent: 10,
    fuzz: 0,
    minCount: 0,
  });
  try {
    // Unfuzzed value at count=5 is 1000 * 10^5 = 1e8, capped to 100.
    // With fuzz=0: factor is (random * 0 + 1) = 1. Result: 100.
    test.equal(retry.retryLater(5, noop), 100);
  } finally {
    retry.clear();
  }
});

Tinytest.addAsync("retry - retryLater actually fires the callback", async (test) => {
  const retry = new Retry({ minCount: 1, minTimeout: 1, fuzz: 0 });
  await new Promise((resolve) => {
    retry.retryLater(0, resolve);
  });
  test.ok();
  retry.clear();
});

Tinytest.addAsync("retry - clear cancels pending callback", async (test) => {
  const retry = new Retry({ minCount: 1, minTimeout: 1000 });
  let fired = false;
  retry.retryLater(0, () => {
    fired = true;
  });
  retry.clear();

  await new Promise((resolve) => setTimeout(resolve, 50));
  test.isFalse(fired, "cancelled callback should not fire");
});

Tinytest.addAsync("retry - retryLater replaces pending timer", async (test) => {
  const retry = new Retry({ minCount: 1, minTimeout: 1, fuzz: 0 });
  let firedFirst = false;
  let firedSecond = false;

  retry.retryLater(0, () => {
    firedFirst = true;
  });
  retry.retryLater(0, () => {
    firedSecond = true;
  });

  // Wait long enough that both timers would have fired if not cancelled.
  await new Promise((resolve) => setTimeout(resolve, 30));

  test.isFalse(firedFirst, "first callback should have been replaced");
  test.isTrue(firedSecond, "second callback should have fired");
  retry.clear();
});

Tinytest.add("retry - clear is idempotent", (test) => {
  const retry = new Retry();
  retry.clear();
  retry.clear();
  retry.clear();
  test.ok();
});

// Minimal AbortSignal stand-in so the tests are deterministic and do not
// depend on a global AbortController.
const makeFakeSignal = () => {
  const listeners = new Set();
  return {
    aborted: false,
    addEventListener(type, fn) {
      if (type === "abort") listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === "abort") listeners.delete(fn);
    },
    abort() {
      if (this.aborted) return;
      this.aborted = true;
      [...listeners].forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const newRetry = () => new Retry({ minCount: 1, minTimeout: 20, fuzz: 0 });

Tinytest.addAsync("retry - signal: abort before firing cancels the callback", async (test) => {
  const retry = newRetry();
  const signal = makeFakeSignal();
  let fired = false;

  const delay = retry.retryLater(
    0,
    () => {
      fired = true;
    },
    { signal },
  );
  signal.abort();
  await sleep(80);

  test.isFalse(fired, "aborted callback should not fire");
  test.equal(delay, 20);
  test.equal(signal.listenerCount(), 0);
  retry.clear();
});

Tinytest.addAsync("retry - signal: already aborted schedules nothing", async (test) => {
  const retry = newRetry();
  const signal = makeFakeSignal();
  signal.abort();
  let fired = false;

  const delay = retry.retryLater(
    0,
    () => {
      fired = true;
    },
    { signal },
  );
  await sleep(80);

  test.isFalse(fired, "callback should never be scheduled");
  test.equal(delay, 20);
  test.equal(signal.listenerCount(), 0);
  retry.clear();
});

Tinytest.addAsync("retry - signal: callback runs normally when not aborted", async (test) => {
  const retry = newRetry();
  const signal = makeFakeSignal();
  let fired = 0;

  retry.retryLater(
    0,
    () => {
      fired++;
    },
    { signal },
  );
  await sleep(80);

  test.equal(fired, 1);
  test.equal(signal.listenerCount(), 0); // listener released after completion
  retry.clear();
});