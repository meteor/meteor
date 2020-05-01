import { Match, check } from 'meteor/check';

const identity = x => x;

const compose = (fns, context) =>
  fns.reduce((a, b) => (data) => {
    const bResult = b.apply(context, [data]);

    // If a hook returns undefined, pass the same arguments to the next hook
    if (bResult === undefined) {
      return a.apply(context, [data]);
    } else if (!Match.test(bResult, Object)) {
      throw new Meteor.Error(`Invalid hook return value, you have to return an object or undefined (in method "${data?.config?.name}")`);
    }

    // If a hook returns something, check it's an object and shallow merge it
    return a.apply(context, [{ ...data, ...bResult }]);
  }, identity);

// Let's you add before and after hooks and call them all at once
class HookManager {
  constructor() {
    this.beforeHooks = [];
    this.afterHooks = [];
  }

  addBeforeHook(fn) {
    check(fn, Function);
    this.beforeHooks = [...this.beforeHooks, fn];
  }

  addAfterHook(fn) {
    check(fn, Function);
    this.afterHooks = [...this.afterHooks, fn];
  }

  runBeforeHooks(context, data) {
    return compose(this.beforeHooks, context)(data);
  }

  runAfterHooks(context, data) {
    return compose(this.afterHooks, context)(data);
  }
}

export default HookManager;