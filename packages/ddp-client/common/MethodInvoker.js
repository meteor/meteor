// A MethodInvoker manages sending a method to the server and calling the user's
// callbacks. On construction, it registers itself in the connection's
// _methodInvokers map; it removes itself once the method is fully finished and
// the callback is invoked. This occurs when it has both received a result,
// and the data written by it is fully visible.
export default class MethodInvoker {
  constructor(options) {
    var self = this;

    // Public (within this file) fields.
    self.methodId = options.methodId;
    self.sentMessage = false;

    self._callback = options.callback;
    self._connection = options.connection;
    self._message = options.message;
    self._onResultReceived = options.onResultReceived || function() {};
    self._wait = options.wait;
    self.noRetry = options.noRetry;
    self._methodResult = null;
    self._dataVisible = false;

    // Register with the connection.
    self._connection._methodInvokers[self.methodId] = self;
  }
  // Sends the method message to the server. May be called additional times if
  // we lose the connection and reconnect before receiving a result.
  sendMessage() {
    var self = this;
    // This function is called before sending a method (including resending on
    // reconnect). We should only (re)send methods where we don't already have a
    // result!
    if (self.gotResult())
      throw new Error('sendingMethod is called on method with result');

    // If we're re-sending it, it doesn't matter if data was written the first
    // time.
    self._dataVisible = false;
    self.sentMessage = true;

    // If this is a wait method, make all data messages be buffered until it is
    // done.
    if (self._wait)
      self._connection._methodsBlockingQuiescence[self.methodId] = true;

    // Actually send the message.
    self._connection._send(self._message);
  }
  // Invoke the callback, if we have both a result and know that all data has
  // been written to the local cache.
  _maybeInvokeCallback() {
    var self = this;
    if (self._methodResult && self._dataVisible) {
      // Call the callback. (This won't throw: the callback was wrapped with
      // bindEnvironment.)
      self._callback(self._methodResult[0], self._methodResult[1]);

      // Forget about this method.
      delete self._connection._methodInvokers[self.methodId];

      // Let the connection know that this method is finished, so it can try to
      // move on to the next block of methods.
      self._connection._outstandingMethodFinished();
    }
  }
  // Call with the result of the method from the server. Only may be called
  // once; once it is called, you should not call sendMessage again.
  // If the user provided an onResultReceived callback, call it immediately.
  // Then invoke the main callback if data is also visible.
  receiveResult(err, result) {
    var self = this;
    if (self.gotResult())
      throw new Error('Methods should only receive results once');
    self._methodResult = [err, result];
    self._onResultReceived(err, result);
    self._maybeInvokeCallback();
  }
  // Call this when all data written by the method is visible. This means that
  // the method has returns its "data is done" message *AND* all server
  // documents that are buffered at that time have been written to the local
  // cache. Invokes the main callback if the result has been received.
  dataVisible() {
    var self = this;
    self._dataVisible = true;
    self._maybeInvokeCallback();
  }
  // True if receiveResult has been called.
  gotResult() {
    var self = this;
    return !!self._methodResult;
  }
}
