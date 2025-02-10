DDPServer._WriteFence = class {
  constructor() {
    this.armed = false;
    this.fired = false;
    this.retired = false;
    this.outstanding_writes = 0;
    this.before_fire_callbacks = [];
    this.completion_callbacks = [];
  }

  beginWrite() {
    if (this.retired) {
      return { committed: () => {} };
    }

    if (this.fired) {
      throw new Error("fence has already activated -- too late to add writes");
    }

    this.outstanding_writes++;
    let committed = false;

    return {
      committed: async () => {
        if (committed) {
          throw new Error("committed called twice on the same write");
        }
        committed = true;
        this.outstanding_writes--;
        await this._maybeFire();
      }
    };
  }

  arm() {
    if (this === DDPServer._getCurrentFence()) {
      throw Error("Can't arm the current fence");
    }
    this.armed = true;
    return this._maybeFire();
  }

  onBeforeFire(func) {
    if (this.fired) {
      throw new Error("fence has already activated -- too late to add a callback");
    }
    this.before_fire_callbacks.push(func);
  }

  onAllCommitted(func) {
    if (this.fired) {
      throw new Error("fence has already activated -- too late to add a callback");
    }
    this.completion_callbacks.push(func);
  }

  async _armAndWait() {
    let resolver;
    const returnValue = new Promise(r => resolver = r);
    this.onAllCommitted(resolver);
    await this.arm();
    return returnValue;
  }

  armAndWait() {
    return this._armAndWait();
  }

  async _maybeFire() {
    if (this.fired) {
      throw new Error("write fence already activated?");
    }

    if (!this.armed || this.outstanding_writes > 0) {
      return;
    }

    const invokeCallback = async (func) => {
      try {
        await func(this);
      } catch (err) {
        Meteor._debug("exception in write fence callback:", err);
      }
    };

    this.outstanding_writes++;

    // Process all before_fire callbacks in parallel
    const beforeCallbacks = [...this.before_fire_callbacks];
    this.before_fire_callbacks = [];
    await Promise.all(beforeCallbacks.map(cb => invokeCallback(cb)));

    this.outstanding_writes--;

    if (this.outstanding_writes === 0) {
      this.fired = true;
      // Process all completion callbacks in parallel
      const callbacks = [...this.completion_callbacks];
      this.completion_callbacks = [];
      await Promise.all(callbacks.map(cb => invokeCallback(cb)));
    }
  }

  retire() {
    if (!this.fired) {
      throw new Error("Can't retire a fence that hasn't fired.");
    }
    this.retired = true;
  }
};

DDPServer._CurrentWriteFence = new Meteor.EnvironmentVariable;