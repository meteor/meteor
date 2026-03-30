import { createThreadContext, getActiveBridgeCount, destroyAllBridges } from 'meteor/thread-context';

if (Meteor.isServer) {

Tinytest.add('thread-context - shutdown - getActiveBridgeCount starts at zero', function (test) {
  test.equal(getActiveBridgeCount(), 0);
});

Tinytest.add('thread-context - shutdown - createThreadContext registers, destroy unregisters', function (test) {
  const before = getActiveBridgeCount();

  const ctx1 = createThreadContext();
  test.equal(getActiveBridgeCount(), before + 1);

  const ctx2 = createThreadContext();
  test.equal(getActiveBridgeCount(), before + 2);

  ctx1.destroy();
  test.equal(getActiveBridgeCount(), before + 1);

  ctx2.destroy();
  test.equal(getActiveBridgeCount(), before);
});

Tinytest.add('thread-context - shutdown - double destroy is safe', function (test) {
  const ctx = createThreadContext();
  ctx.destroy();
  ctx.destroy();
  test.ok();
});

Tinytest.add('thread-context - shutdown - destroyAllBridges cleans up all contexts', function (test) {
  const before = getActiveBridgeCount();

  createThreadContext();
  createThreadContext();
  createThreadContext();
  test.equal(getActiveBridgeCount(), before + 3);

  destroyAllBridges();
  test.equal(getActiveBridgeCount(), 0);
});

} // end Meteor.isServer
