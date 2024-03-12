// A write fence collects a group of writes, and provides a callback
// when all of the writes are fully committed and propagated (all
// observers have been notified of the write and acknowledged it.)
//
DDPServer._WriteFence = class {
  constructor() {
    this.armed = false;
    this.fired = false;
    this.retired = false;
    this.outstanding_writes = 0;
    this.before_fire_callbacks = [];
    this.completion_callbacks = [];
  }

  // Start tracking a write, and return an object to represent it. The
  // object has a single method, committed(). This method should be
  // called when the write is fully committed and propagated. You can
  // continue to add writes to the WriteFence up until it is triggered
  // (calls its callbacks because all writes have committed.)
  beginWrite() {
    if (this.retired)
      return { committed: function () {} };

    if (this.fired)
      throw new Error("fence has already activated -- too late to add writes");

    this.outstanding_writes++;
    let committed = false;
    const _committedFn = async () => {
      if (committed)
        throw new Error("committed called twice on the same write");
      committed = true;
      this.outstanding_writes--;
      await this._maybeFire();
    };

    return {
      committed: _committedFn,
    };
  }

  // Arm the fence. Once the fence is armed, and there are no more
  // uncommitted writes, it will activate.
  arm() {

    if (this === DDPServer._getCurrentFence())
      throw Error("Can't arm the current fence");
    this.armed = true;
    return this._maybeFire();
  }

  // Register a function to be called once before firing the fence.
  // Callback function can add new writes to the fence, in which case
  // it won't fire until those writes are done as well.
  onBeforeFire(func) {
    if (this.fired)
      throw new Error("fence has already activated -- too late to " +
          "add a callback");
    this.before_fire_callbacks.push(func);
  }

  // Register a function to be called when the fence fires.
  onAllCommitted(func) {
    if (this.fired)
      throw new Error("fence has already activated -- too late to " +
          "add a callback");
    this.completion_callbacks.push(func);
  }

  async _armAndWait() {
    let resolver;
    const returnValue = new Promise(r => resolver = r);
    this.onAllCommitted(resolver);
    await this.arm();

    return returnValue;
  }
  // Convenience function. Arms the fence, then blocks until it fires.
  async armAndWait() {
    return this._armAndWait();
  }

  async _maybeFire() {
    if (this.fired)
      throw new Error("write fence already activated?");
    if (this.armed && !this.outstanding_writes) {
      const invokeCallback = async (func) => {
        try {
          await func(this);
        } catch (err) {
          Meteor._debug("exception in write fence callback:", err);
        }
      };

      this.outstanding_writes++;
      while (this.before_fire_callbacks.length > 0) {
        const cb = this.before_fire_callbacks.shift();
        await invokeCallback(cb);
      }
      this.outstanding_writes--;

      if (!this.outstanding_writes) {
        this.fired = true;
        const callbacks = this.completion_callbacks || [];
        this.completion_callbacks = [];
        while (callbacks.length > 0) {
          const cb = callbacks.shift();
          await invokeCallback(cb);
        }
      }
    }
  }

  // Deactivate this fence so that adding more writes has no effect.
  // The fence must have already fired.
  retire() {
    if (!this.fired)
      throw new Error("Can't retire a fence that hasn't fired.");
    this.retired = true;
  }
};

// The current write fence. When there is a current write fence, code
// that writes to databases should register their writes with it using
// beginWrite().
//
DDPServer._CurrentWriteFence = new Meteor.EnvironmentVariable;
