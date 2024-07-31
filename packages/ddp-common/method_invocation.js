// Instance name is this because it is usually referred to as this inside a
// method definition
/**
 * @summary The state for a single invocation of a method, referenced by this
 * inside a method definition.
 * @param {Object} options
 * @instanceName this
 * @showInstanceName true
 */
DDPCommon.MethodInvocation = class MethodInvocation {
  constructor(options) {
    // true if we're running not the actual method, but a stub (that is,
    // if we're on a client (which may be a browser, or in the future a
    // server connecting to another server) and presently running a
    // simulation of a server-side method for latency compensation
    // purposes). not currently true except in a client such as a browser,
    // since there's usually no point in running stubs unless you have a
    // zero-latency connection to the user.

    /**
     * @summary The name given to the method.
     * @locus Anywhere
     * @name  name
     * @memberOf DDPCommon.MethodInvocation
     * @instance
     * @type {String}
     */
    this.name = options.name;

    /**
     * @summary Access inside a method invocation.  Boolean value, true if this invocation is a stub.
     * @locus Anywhere
     * @name  isSimulation
     * @memberOf DDPCommon.MethodInvocation
     * @instance
     * @type {Boolean}
     */
    this.isSimulation = options.isSimulation;

    // call this function to allow other method invocations (from the
    // same client) to continue running without waiting for this one to
    // complete.
    this._unblock = options.unblock || function () {};
    this._calledUnblock = false;

    // used to know when the function apply was called by callAsync
    this._isFromCallAsync = options.isFromCallAsync;

    // current user id

    /**
     * @summary The id of the user that made this method call, or `null` if no user was logged in.
     * @locus Anywhere
     * @name  userId
     * @memberOf DDPCommon.MethodInvocation
     * @instance
     */
    this.userId = options.userId;

    // sets current user id in all appropriate server contexts and
    // reruns subscriptions
    this._setUserId = options.setUserId || function () {};

    // On the server, the connection this method call came in on.

    /**
     * @summary Access inside a method invocation. The [connection](#meteor_onconnection) that this method was received on. `null` if the method is not associated with a connection, eg. a server initiated method call. Calls to methods made from a server method which was in turn initiated from the client share the same `connection`.
     * @locus Server
     * @name  connection
     * @memberOf DDPCommon.MethodInvocation
     * @instance
     */
    this.connection = options.connection;

    // The seed for randomStream value generation
    this.randomSeed = options.randomSeed;

    // This is set by RandomStream.get; and holds the random stream state
    this.randomStream = null;

    this.fence = options.fence;
  }

  /**
   * @summary Call inside a method invocation.  Allow subsequent method from this client to begin running in a new fiber.
   * @locus Server
   * @memberOf DDPCommon.MethodInvocation
   * @instance
   */
  unblock() {
    this._calledUnblock = true;
    this._unblock();
  }

  /**
   * @summary Set the logged in user.
   * @locus Server
   * @memberOf DDPCommon.MethodInvocation
   * @instance
   * @param {String | null} userId The value that should be returned by `userId` on this connection.
   */
  setUserId(userId) {
    if (this._calledUnblock) {
      throw new Error("Can't call setUserId in a method after calling unblock");
    }
    this.userId = userId;
    this._setUserId(userId);
  }
};
