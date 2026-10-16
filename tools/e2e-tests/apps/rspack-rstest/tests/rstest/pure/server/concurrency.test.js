let active = 0;
let started = 0;
let release;
const firstPairStarted = new Promise(resolve => {
  release = resolve;
});

describe.concurrent('native Rstest concurrent suite', () => {
  for (const name of ['alpha', 'beta', 'gamma']) {
    test(name, async () => {
      active += 1;
      started += 1;
      expect(active <= 2).toBe(true);
      if (started === 2) release();
      await firstPairStarted;
      active -= 1;
    });
  }

  test.sequential('waits for native concurrent cases', () => {
    expect(active).toBe(0);
    expect(started).toBe(3);
  });
});
