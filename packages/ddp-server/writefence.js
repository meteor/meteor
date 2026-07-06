// A write fence collects a group of writes, and provides a callback when all
// of the writes are fully committed and propagated (all observers have been
// notified of the write and acknowledged it).
//
// The fence advances through named phases:
//
//   OPEN ──arm()──► ARMED ──writes drained──► FIRING ──► FIRED ──retire()──► RETIRED
//                     ▲                          │
//                     └── writes began during ───┘
//                         before-fire callbacks
//
//   OPEN     accepts writes and callbacks; never fires, even at zero writes.
//   ARMED    accepts writes and callbacks; fires once outstanding writes
//            reach zero.
//   FIRING   before-fire callbacks are running; writes they begin hold the
//            fence open (returning it to ARMED until they commit).
//   FIRED    completion callbacks have run; beginning a write is an error.
//   RETIRED  a late write (e.g. from a straggling timer) is a silent no-op.
const PHASE = Object.freeze({
  OPEN: 'OPEN',
  ARMED: 'ARMED',
  FIRING: 'FIRING',
  FIRED: 'FIRED',
  RETIRED: 'RETIRED',
});

DDPServer._WriteFence = class {
  constructor() {
    this._phase = PHASE.OPEN;
    this.outstanding_writes = 0;
    this.before_fire_callbacks = [];
    this.completion_callbacks = [];
  }

  get phase() {
    return this._phase;
  }

  // Legacy flag accessors: external code reads these (e.g. the mongo observe
  // drivers check fence.fired).
  get armed() {
    return this._phase !== PHASE.OPEN;
  }

  get fired() {
    return this._phase === PHASE.FIRED || this._phase === PHASE.RETIRED;
  }

  get retired() {
    return this._phase === PHASE.RETIRED;
  }

  _transition(to, legalFrom) {
    if (!legalFrom.includes(this._phase)) {
      throw new Error(
        'invalid write fence transition: ' + this._phase + ' -> ' + to
      );
    }
    this._phase = to;
  }

  beginWrite() {
    if (this._phase === PHASE.RETIRED) {
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
    if (this._phase === PHASE.OPEN) {
      this._transition(PHASE.ARMED, [PHASE.OPEN]);
    }
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

    if (this._phase !== PHASE.ARMED || this.outstanding_writes > 0) {
      return;
    }

    this._transition(PHASE.FIRING, [PHASE.ARMED]);

    const invokeCallback = async (func) => {
      try {
        await func(this);
      } catch (err) {
        Meteor._debug("exception in write fence callback:", err);
      }
    };

    // Hold the fence open while the before-fire callbacks run: writes they
    // begin (e.g. observe drivers acknowledging invalidations) must be able
    // to commit before the fence fires.
    this.outstanding_writes++;

    // Process all before_fire callbacks in parallel
    const beforeCallbacks = [...this.before_fire_callbacks];
    this.before_fire_callbacks = [];
    await Promise.all(beforeCallbacks.map(cb => invokeCallback(cb)));

    this.outstanding_writes--;

    if (this.outstanding_writes === 0) {
      this._transition(PHASE.FIRED, [PHASE.FIRING]);
      // Process all completion callbacks in parallel
      const callbacks = [...this.completion_callbacks];
      this.completion_callbacks = [];
      await Promise.all(callbacks.map(cb => invokeCallback(cb)));
    } else {
      // Writes began during the before-fire callbacks; their commits will
      // re-run _maybeFire (picking up any callbacks registered meanwhile).
      this._transition(PHASE.ARMED, [PHASE.FIRING]);
    }
  }

  retire() {
    if (!this.fired) {
      throw new Error("Can't retire a fence that hasn't fired.");
    }
    // RETIRED -> RETIRED keeps retire() idempotent, as it always was.
    this._transition(PHASE.RETIRED, [PHASE.FIRED, PHASE.RETIRED]);
  }
};

DDPServer._WriteFence.PHASES = PHASE;

DDPServer._CurrentWriteFence = new Meteor.EnvironmentVariable;
