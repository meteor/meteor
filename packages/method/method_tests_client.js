import {
  clientCount,
  commonMethodServerAndClient,
  commonMethodServerOnly,
  serverOnlyCount,
  throwingMethod,
} from './method_tests_setup';

import { Tinytest } from "meteor/tinytest";
import { methodOptions } from './method_client';

Tinytest.addAsync("method client - calls method hooks if method is server-only", (test, done) => {
  commonMethodServerOnly.call({ args: [3, 2] }).then(result => {
    test.equal(result, 6);
    test.equal(serverOnlyCount, 1);
    done();
  });
});

Tinytest.addAsync("method client - calls method hooks if method is defined on both sides", (test, done) => {
  commonMethodServerAndClient.call({ args: [3] }).then(result => {
    test.equal(result, 4);
    test.equal(clientCount, 5);
    done();
  });
});

Tinytest.addAsync("method client - catch method errors", (test, done) => {
  throwingMethod.call().then(result => {
    test.equal('should throw', false);
    done();
  }).catch(error => {
    test.equal(error.error, 'threw');
    done();
  });
});

Tinytest.addAsync("method client - calls multiple hooks", (test, done) => {
  methodOptions.addBeforeHook(({ args }) => ({ args: args.map(x => x * 2) }));
  commonMethodServerOnly.addBeforeHook(({ args }) => ({ args: args.map(x => x * 2) }));
  
  methodOptions.addAfterHook(({ result }) => ({ result: result * 2 }));
  commonMethodServerOnly.addAfterHook(({ result }) => ({ result: result * 2 }));

  commonMethodServerOnly.call({ args: [5, 2] }).then(result => {
    // [10, 4]
    // [20, 8]
    // 160
    // 320
    // 640
    test.equal(result, 640);
    methodOptions.beforeHooks = [];
    methodOptions.afterHooks = [];
    done();
  });
});
