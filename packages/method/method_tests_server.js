import Method, { methodOptions } from './method_server';
import {
  commonMethodServerAndClient,
  commonMethodServerOnly,
  serverCount,
  serverOnlyCount,
} from './method_tests_setup';

import { Tinytest } from "meteor/tinytest";

Tinytest.add("method server - declare and call a method synchronously", test => {
  const method = new Method({ name: 'method_test_1' });
  method.setHandler((a, b) => {
    return a + b;
  })

  const result = method.call({ args: [1, 2] });

  test.equal(result, 3);
});

Tinytest.addAsync("method server - calls global hooks", (test, next) => {
  const method = new Method({ name: 'method_test_2' });
  method.setHandler((a, b) => {
    return a + b;
  });

  methodOptions.addBeforeHook(({ args }) => {
    test.equal(args[0], 1);
    test.equal(args[1], 2);
    methodOptions.beforeHooks = [];
    next();
  })

  method.call({ args: [1, 2] });
});

Tinytest.add("method server - calls method hooks", (test, done) => {
  const result = commonMethodServerOnly.call({ args: [3, 2] })
  test.equal(result, 6);
  test.equal(serverOnlyCount, 1);
});

Tinytest.add("method server - calls method hooks defined on both sides", (test, done) => {
  const result = commonMethodServerAndClient.call({ args: [4] })
  test.equal(result, 5);
  test.equal(serverCount, 6);
});

Tinytest.add("method server - customize method context", (test, done) => {
  const method = new Method({ name: 'method_test_3' });
  method.setHandler((a, b) => {
    return this.getMethodName();
  });

  methodOptions.addBeforeHook(({ config }) => {
    this.getMethodName = () => config.name;
  });

  const result = method.call();

  test.equal(result, 'method_test_3');
});

Tinytest.add("method server - update a method's config", test => {
  const method = new Method({ name: 'method_test_4', someConfig: 'hello' });
  let text;
  method.setHandler(() => {});
  method.addBeforeHook(({ config }) => {
    text = config.someConfig;
  })
  
  method.call();
  test.equal(text, 'hello');

  method.updateConfig({ someConfig: 'world' });
  
  method.call();
  test.equal(text, 'world');
});

Tinytest.add("method server - throws properly", test => {
  const method = new Method({ name: 'method_test_5' });
  method.setHandler(() => {
    throw new Meteor.Error('throws')
  });
  
  try {
    method.call();
    test.equal('throws', false);
  } catch (error) {
    test.equal(error.error, 'throws');
  }
});

Tinytest.add("method server - transform method results", test => {
  const method = new Method({ name: 'method_test_6' });
  method.setHandler((a, b) => {
    return a + b;
  });

  methodOptions.addAfterHook(({ result }) => ({ result: result * 2 }));
  const result = method.call({ args: [1, 2] });
  
  test.equal(result, 6);
  methodOptions.afterHooks = [];
});

Tinytest.add("method server - transform method errors", test => {
  const method = new Method({ name: 'method_test_7' });
  method.setHandler(() => {
    throw new Meteor.Error('old error')
  });

  methodOptions.addAfterHook(({ error }) => {
    error.error = 'new error';
    return { error };
  });

  try {
    method.call();
    test.equal('throws', false);
  } catch (error) {
    test.equal(error.error, 'new error');
  }
  
  methodOptions.afterHooks = [];
});

Tinytest.add("method server - does not allow hooks that return null", test => {
  const method = new Method({ name: 'method_test_8' });
  method.setHandler((a, b) => {
    return a + b;
  });

  methodOptions.addAfterHook(() => null);
  try {
    const result = method.call({ args: [1, 2] });
    test.equal('throws', false);
  } catch (error) {
    test.include(error.error, 'Invalid hook return value');
    test.include(error.error, 'method_test_8');
    methodOptions.afterHooks = [];
  }
});