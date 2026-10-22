Meteor._noYieldsAllowed = function (f) {
  var result = f();
  if (Meteor._isPromise(result)) {
    throw new Error("function is a promise when calling Meteor._noYieldsAllowed");
  }
  return result
};

function FakeDoubleEndedQueue () {
  this.queue = [];
}

FakeDoubleEndedQueue.prototype.push = function (task) {
  this.queue.push(task);
};

FakeDoubleEndedQueue.prototype.shift = function () {
  return this.queue.shift();
};

FakeDoubleEndedQueue.prototype.isEmpty = function () {
  return this.queue.length === 0;
};

Meteor._DoubleEndedQueue = Meteor.isServer ? Npm.require('denque') : FakeDoubleEndedQueue;


// Sleep. Mostly used for debugging (eg, inserting latency into server
// methods).
//
const _sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
Meteor._sleepForMs = function (ms) {
  return _sleep(ms);
};

Meteor.sleep = _sleep;