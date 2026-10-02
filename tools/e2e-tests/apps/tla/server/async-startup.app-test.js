// Regression coverage for meteortesting/meteor-mocha PR #177
// https://github.com/Meteor-Community-Packages/meteor-mocha/pull/177
//
// Before that fix, mocha.run() could fire before async Meteor.startup()
// callbacks finished draining, so any test relying on async startup work
// would observe a half-initialized state.
//
// The describe block is `.skip`'d for now because the fix is not yet in a
// published meteortesting:mocha. When the fix ships:
//   1. Remove `.skip` below.
//   2. In tools/e2e-tests/tla.test.js, switch the `1 passing` regex to
//      `2 passing` so the E2E asserts both tests run.
//   3. To validate a specific published version, pin it by adding
//      `meteortesting:mocha@<version>` to .meteor/packages of this app
//      (the --driver-package flag still resolves it).
import { Meteor } from 'meteor/meteor';
import assert from 'assert';

let asyncStartupDone = false;

Meteor.startup(async () => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  asyncStartupDone = true;
  console.log('[tla] async startup complete');
});

describe.skip('async Meteor.startup', function () {
  it('runs after async startup callbacks complete', function () {
    assert.strictEqual(asyncStartupDone, true);
  });
});
