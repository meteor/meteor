import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';

const LOGIN_TYPE = '__test';

Tinytest.addAsync(
  'accounts - login - successful attempt with options',
  async test => {
    // --SETUP--
    const testUserId = await Meteor.callAsync('registerTestLoginHandler');
    const validateResultHandler = new MockFunction();
    const onLoginHandler = new MockFunction();
    const onLoginHook = Accounts.onLogin(onLoginHandler);

    // --TEST--
    const result = await callLoginMethodAsync({
      methodArguments: [{ [LOGIN_TYPE]: { userId: testUserId } }],
      validateResult: validateResultHandler,
    });

    // `result` is the `userCallback` result.
    expectResult(test, result, testUserId);

    // Verify the `validateResult` parameter.
    const validateResultCallsCount = validateResultHandler.mock.calls.length;
    test.equal(validateResultCallsCount, 1);

    if (validateResultCallsCount === 1) {
      const [result] = validateResultHandler.mock.calls[0];
      expectResult(test, result, testUserId);
    }

    // Verify the `onLogin` parameter.
    const onLoginHandlerCallsCount = onLoginHandler.mock.calls.length;
    test.equal(onLoginHandlerCallsCount, 1);

    if (onLoginHandlerCallsCount === 1) {
      const [result] = onLoginHandler.mock.calls[0];
      expectResult(test, result, testUserId);
    }

    // --TEARDOWN--
    onLoginHook.stop();
    await Meteor.callAsync('removeTestLoginHandler', testUserId);
  },
);

function callLoginMethodAsync({ methodArguments, validateResult }) {
  return new Promise((resolve, reject) => {
    Accounts.callLoginMethod({
      methodArguments,
      validateResult(result) {
        validateResult?.(result);
      },
      userCallback(error, result) {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    });
  });
}

function expectResult(test, result, userId) {
  test.equal(result.type, LOGIN_TYPE);
  test.equal(result.id, userId);
  test.equal(result.foo, 'bar'); // comes from `options`
}
