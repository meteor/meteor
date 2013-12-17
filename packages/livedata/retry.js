// Retry logic with an exponential backoff.

Retry = function (options) {
  var self = this;
  _.extend(self, _.defaults(_.clone(options || {}), {
    // time for initial reconnect attempt.
    baseTimeout: 1000,
    // exponential factor to increase timeout each attempt.
    exponent: 2.2,
    // maximum time between reconnects. keep this intentionally
    // high-ish to ensure a server can recover from a failure caused
    // by load
    maxTimeout: 5 * 60000, // 5 minutes
    // time to wait for the first 2 retries.  this helps page reload
    // speed during dev mode restarts, but doesn't hurt prod too
    // much (due to CONNECT_TIMEOUT)
    minTimeout: 10,
    // how many times to try to reconnect 'instantly'
    minCount: 2,
    // fuzz factor to randomize reconnect times by. avoid reconnect
    // storms.
    fuzz: 0.5 // +- 25%
  }));
  self.retryTimer = null;
};

_.extend(Retry.prototype, {

  // Reset a pending retry, if any.
  clear: function () {
    var self = this;
    if (self.retryTimer)
      clearTimeout(self.retryTimer);
    self.retryTimer = null;
  },

  // Calculate how long to wait in milliseconds to retry, based on the
  // `count` of which retry this is.
  _timeout: function (count) {
    var self = this;

    if (count < self.minCount)
      return self.minTimeout;

    var timeout = Math.min(
      self.maxTimeout,
      self.baseTimeout * Math.pow(self.exponent, count));
    // fuzz the timeout randomly, to avoid reconnect storms when a
    // server goes down.
    timeout = timeout * ((Random.fraction() * self.fuzz) +
                         (1 - self.fuzz/2));
    return timeout;
  },

  // Call `fn` after a delay, based on the `count` of which retry this is.
  retryLater: function (count, fn) {
    var self = this;
    var timeout = self._timeout(count);
    if (self.retryTimer)
      clearTimeout(self.retryTimer);
    self.retryTimer = setTimeout(fn, timeout);
    return timeout;
  }

});
