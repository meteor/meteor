import { Meteor } from 'meteor/meteor';
import { describe, expect, test } from 'meteor/rstest';

let active = 0;
let started = 0;
let release;
const firstPairStarted = new Promise(resolve => {
  release = resolve;
});

describe.concurrent('Meteor runtime concurrent suite', () => {
  for (const name of ['alpha', 'beta', 'gamma']) {
    test(name, async () => {
      expect(Meteor.isServer).toBe(true);
      active += 1;
      started += 1;
      expect(active <= 2).toBe(true);
      if (started === 2) release();
      await firstPairStarted;
      active -= 1;
    });
  }

  test.sequential('waits for shared-runtime concurrent cases', () => {
    expect(active).toBe(0);
    expect(started).toBe(3);
  });
});
