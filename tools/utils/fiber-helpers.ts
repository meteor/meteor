import _ from "underscore";
const Fiber = require("fibers");

export function parallelEach(collection: any, callback: Function, context: any | null = null) {
  const errors: Error[] = [];

  const results = Promise.all(_.map(collection, (...args) => {
    async function run() {
      return callback.apply(context, args);
    }

    return run().catch(error => {
      // Collect the errors but do not propagate them so that we can
      // re-throw the first error after all iterations have completed.
      errors.push(error);
    });
  })).await();

  if (errors.length > 0) {
    throw errors[0];
  }

  return results;
};

function disallowedYield() {
  throw new Error("Can't call yield in a noYieldsAllowed block!");
}
// Allow testing Fiber.yield.disallowed.
disallowedYield.disallowed = true;

export function noYieldsAllowed(f: Function, context: any) {
  const savedYield = Fiber.yield;
  Fiber.yield = disallowedYield;
  try {
    return f.call(context || null);
  } finally {
    Fiber.yield = savedYield;
  }
};

// Borrowed from packages/meteor/dynamics_nodejs.js
// Used by buildmessage

export function nodeCodeMustBeInFiber() {
  if (!Fiber.current) {
    throw new Error("Meteor code must always run within a Fiber. " +
      "Try wrapping callbacks that you pass to non-Meteor " +
      "libraries with Meteor.bindEnvironment.");
  }
};

let nextSlot = 0;

export class EnvironmentVariable {
  private readonly slot: string;

  constructor(private readonly defaultValue: any) {
    this.slot = 'slot' + nextSlot++;
  }

  get() {
    nodeCodeMustBeInFiber();

    if (!Fiber.current._meteorDynamics) {
      return this.defaultValue;
    }
    if (!_.has(Fiber.current._meteorDynamics, this.slot)) {
      return this.defaultValue;
    }
    return Fiber.current._meteorDynamics[this.slot];
  }

  set(value: any): Function {
    nodeCodeMustBeInFiber();

    const fiber = Fiber.current;
    const currentValues: any = fiber._meteorDynamics || (
      fiber._meteorDynamics = {});

    const saved = _.has(currentValues, this.slot)
      ? currentValues[this.slot]
      : this.defaultValue;

    currentValues[this.slot] = value;

    return () => {
      currentValues[this.slot] = saved;
    };
  }

  withValue(value: any, func: Function) {
    const reset = this.set(value);
    try {
      return func();
    } finally {
      reset();
    }
  }
}

// This is like Meteor.bindEnvironment.
// Experimentally, we are NOT including onException or _this in this version.
export function bindEnvironment(func: Function) {
  nodeCodeMustBeInFiber();

  const boundValues = { ...(Fiber.current._meteorDynamics || {}) };

  return function (...args: any[]) {
    //@ts-ignore
    const self = this;

    const runWithEnvironment = () => {
      const savedValues = Fiber.current._meteorDynamics;
      try {
        // Need to clone boundValues in case two fibers invoke this
        // function at the same time
        Fiber.current._meteorDynamics = { ...boundValues };
        return func.apply(self, args);
      } finally {
        Fiber.current._meteorDynamics = savedValues;
      }
    };

    if (Fiber.current) {
      return runWithEnvironment();
    }

    Fiber(runWithEnvironment).run();
  };
};

// Returns a Promise that supports .resolve(result) and .reject(error).
export function makeFulfillablePromise() {
  let resolve: ((value?: any) => void);
  let reject: ((reason?: any) => void);

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  promise.resolve = resolve!;
  promise.reject = reject!;

  return promise;
};
