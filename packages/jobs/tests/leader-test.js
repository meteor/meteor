/**
 * @module jobs/tests/leader-test
 * @summary Tests for leader election API.
 */

const { Jobs } = require('meteor/jobs');

Tinytest.add('jobs - leader - isLeader returns boolean', function (test) {
  // _isLeader() should return a boolean regardless of state
  const result = Jobs._isLeader();
  test.equal(typeof result, 'boolean');
});

Tinytest.addAsync('jobs - leader - leader can be started and stopped', async function (test) {
  // Start leader election
  await Jobs._startLeader();

  // After starting, isLeader should still be a boolean
  // (may or may not have acquired depending on MongoDB state)
  test.equal(typeof Jobs._isLeader(), 'boolean');

  // Stop leader election
  await Jobs._stopLeader();

  // After stopping, should no longer be leader
  test.isFalse(Jobs._isLeader());
});

Tinytest.addAsync('jobs - leader - double stop is safe', async function (test) {
  await Jobs._stopLeader();
  await Jobs._stopLeader();
  test.isFalse(Jobs._isLeader());
});
