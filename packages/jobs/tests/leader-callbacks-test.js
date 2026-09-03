/**
 * @module jobs/tests/leader-callbacks-test
 * @summary Tests for leader callback registration, deregistration, and
 * leader election lifecycle.
 */

const { Jobs } = require('meteor/jobs');

// ---------------------------------------------------------------------------
// setOnLeaderAcquired returns a deregistration function
// ---------------------------------------------------------------------------

Tinytest.add('jobs - leader callbacks - setOnLeaderAcquired returns a function', function (test) {
  const dereg = Jobs._setOnLeaderAcquired(function () {});
  test.equal(typeof dereg, 'function', 'Should return a deregistration function');

  // Clean up
  if (dereg) dereg();
});

// ---------------------------------------------------------------------------
// setOnLeaderLost returns a deregistration function
// ---------------------------------------------------------------------------

Tinytest.add('jobs - leader callbacks - setOnLeaderLost returns a function', function (test) {
  const dereg = Jobs._setOnLeaderLost(function () {});
  test.equal(typeof dereg, 'function', 'Should return a deregistration function');

  // Clean up
  if (dereg) dereg();
});

// ---------------------------------------------------------------------------
// Leader election: start acquires leader lock in single-instance test
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - leader callbacks - leader acquired in single instance', async function (test) {
  // Stop any prior election
  await Jobs._stopLeader();

  let acquiredFired = false;
  const dereg = Jobs._setOnLeaderAcquired(function () {
    acquiredFired = true;
  });

  await Jobs._startLeader();

  // In a single-instance test, we should become leader
  // Give a moment for the async path to settle
  await new Promise(r => setTimeout(r, 200));

  test.isTrue(Jobs._isLeader(), 'Should be leader in single-instance test');
  test.isTrue(acquiredFired, 'onLeaderAcquired callback should have fired');

  // Clean up
  await Jobs._stopLeader();
  if (dereg) dereg();
});

// ---------------------------------------------------------------------------
// Leader lost callback fires on stop
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - leader callbacks - leader lost callback fires on stop', async function (test) {
  await Jobs._stopLeader();

  let lostFired = false;
  const dereg = Jobs._setOnLeaderLost(function () {
    lostFired = true;
  });

  await Jobs._startLeader();
  await new Promise(r => setTimeout(r, 200));

  // Should be leader
  test.isTrue(Jobs._isLeader());

  // Stop → should trigger lost callback
  await Jobs._stopLeader();

  test.isFalse(Jobs._isLeader());
  test.isTrue(lostFired, 'onLeaderLost callback should have fired on stop');

  if (dereg) dereg();
});

// ---------------------------------------------------------------------------
// Deregistration prevents callback from firing
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - leader callbacks - deregistered callback does not fire', async function (test) {
  await Jobs._stopLeader();

  let fired = false;
  const dereg = Jobs._setOnLeaderAcquired(function () {
    fired = true;
  });

  // Deregister immediately
  dereg();

  await Jobs._startLeader();
  await new Promise(r => setTimeout(r, 200));

  test.isFalse(fired, 'Deregistered callback should not fire');

  await Jobs._stopLeader();
});

// ---------------------------------------------------------------------------
// Double stop is safe
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - leader callbacks - double start and stop is safe', async function (test) {
  await Jobs._stopLeader();
  await Jobs._stopLeader(); // double stop

  await Jobs._startLeader();
  await Jobs._startLeader(); // double start — should be no-op
  await new Promise(r => setTimeout(r, 200));

  test.isTrue(Jobs._isLeader());

  await Jobs._stopLeader();
  test.isFalse(Jobs._isLeader());
});

// ---------------------------------------------------------------------------
// leader.acquired event fires
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - leader callbacks - leader.acquired event fires', async function (test) {
  await Jobs._stopLeader();

  let eventFired = false;
  const handle = Jobs.on('leader.acquired', function () {
    eventFired = true;
  });

  await Jobs._startLeader();
  await new Promise(r => setTimeout(r, 200));

  test.isTrue(eventFired, 'leader.acquired event should fire');

  handle.stop();
  await Jobs._stopLeader();
});

// ---------------------------------------------------------------------------
// leader.lost event fires
// ---------------------------------------------------------------------------

Tinytest.addAsync('jobs - leader callbacks - leader.lost event fires', async function (test) {
  await Jobs._stopLeader();

  let eventFired = false;
  const handle = Jobs.on('leader.lost', function () {
    eventFired = true;
  });

  await Jobs._startLeader();
  await new Promise(r => setTimeout(r, 200));
  test.isTrue(Jobs._isLeader());

  await Jobs._stopLeader();
  await new Promise(r => setTimeout(r, 100));

  test.isTrue(eventFired, 'leader.lost event should fire');

  handle.stop();
});
