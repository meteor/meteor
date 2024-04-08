import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';

const LOGIN_TYPE = '__test';

/**
 * Registers a test log-in handler.
 * @param {(object) => object} getResult A function that returns the desired results, given the options.
 */
export function registerTestLoginHandler(getResult) {
  Accounts.registerLoginHandler(LOGIN_TYPE, options => {
    if (!options[LOGIN_TYPE]) return;
    return getResult(options[LOGIN_TYPE]);
  });
}

/**
 * Removes the test log-in handler.
 */
export function removeTestLoginHandler() {
  Accounts._loginHandlers = Accounts._loginHandlers.filter(h => h.name !== LOGIN_TYPE);
}

Tinytest.add(
  'accounts - login - successful attempt with options',
  test => {
    // --SETUP--
    const userId = Accounts.insertUserDoc({});
    registerTestLoginHandler(() => ({
      userId,
      options: { foo: 'bar' },
    }));

    const hooks = registerLifecycleHooks();
    const {
      validateLoginAttemptHandler,
      onLoginHandler,
      onLoginFailureHandler,
    } = hooks;

    // --TEST--
    const conn = DDP.connect(Meteor.absoluteUrl());
    const result = conn.call('login', { [LOGIN_TYPE]: true });

    test.equal(result.id, userId);
    test.equal(result.type, LOGIN_TYPE);
    test.equal(result.foo, 'bar');

    expectHandlerCalledWithAttempt(test, validateLoginAttemptHandler, { allowed: true })
    expectHandlerCalledWithAttempt(test, onLoginHandler, { allowed: true });

    test.length(onLoginFailureHandler.mock.calls, 0);

    // --TEARDOWN--
    conn.call('logout');
    conn.disconnect();

    hooks.stop();

    Meteor.users.remove(userId);
    removeTestLoginHandler();
  },
);

Tinytest.add(
  'accounts - login - failed attempt with options and no user',
  test => {
    // --SETUP--
    registerTestLoginHandler(() => ({
      error: new Meteor.Error('log-in-error'),
      options: { foo: 'bar' },
    }));

    const hooks = registerLifecycleHooks();
    const {
      validateLoginAttemptHandler,
      onLoginHandler,
      onLoginFailureHandler,
    } = hooks;

    // --TEST--
    const conn = DDP.connect(Meteor.absoluteUrl());
    test.throws(
      () => conn.call('login', { [LOGIN_TYPE]: true }),
      'log-in-error',
    );

    expectHandlerCalledWithAttempt(test, validateLoginAttemptHandler, { allowed: false });
    expectHandlerCalledWithAttempt(test, onLoginFailureHandler, { allowed: false });

    test.length(onLoginHandler.mock.calls, 0);

    // --TEARDOWN--
    conn.call('logout');
    conn.disconnect();

    hooks.stop();

    removeTestLoginHandler();
  },
);

Tinytest.add(
  'accounts - login - failed attempt with options and a user',
  test => {
    // --SETUP--
    const userId = Accounts.insertUserDoc({});
    registerTestLoginHandler(() => ({
      error: new Meteor.Error('log-in-error'),
      userId,
      options: { foo: 'bar' },
    }));

    const hooks = registerLifecycleHooks();
    const {
      validateLoginAttemptHandler,
      onLoginHandler,
      onLoginFailureHandler,
    } = hooks;

    // --TEST--
    const conn = DDP.connect(Meteor.absoluteUrl());
    test.throws(
      () => conn.call('login', { [LOGIN_TYPE]: true }),
      'log-in-error',
    );

    expectHandlerCalledWithAttempt(test, validateLoginAttemptHandler, { allowed: false, hasUser: true });
    expectHandlerCalledWithAttempt(test, onLoginFailureHandler, { allowed: false, hasUser: true });

    test.length(onLoginHandler.mock.calls, 0);

    // --TEARDOWN--
    conn.call('logout');
    conn.disconnect();

    hooks.stop();

    Meteor.users.remove(userId);
    removeTestLoginHandler();
  },
);

function registerLifecycleHooks() {
  const validateLoginAttemptHandler = new MockFunction(() => true);
  const validateLoginAttemptHook = Accounts.validateLoginAttempt(validateLoginAttemptHandler);

  const onLoginHandler = new MockFunction();
  const onLoginHook = Accounts.onLogin(onLoginHandler);

  const onLoginFailureHandler = new MockFunction();
  const onLoginFailureHook = Accounts.onLoginFailure(onLoginFailureHandler);

  return {
    validateLoginAttemptHandler,
    onLoginHandler,
    onLoginFailureHandler,
    stop() {
      validateLoginAttemptHook.stop();
      onLoginHook.stop();
      onLoginFailureHook.stop();
    },
  };
}


function expectHandlerCalledWithAttempt(test, handler, { allowed, hasUser }) {
  const callCount = handler.mock.calls.length;
  test.equal(callCount, 1);

  if (callCount === 1) {
    const [ attempt ] = handler.mock.calls[0];
    expectLoginAttempt(test, attempt, { allowed, hasUser });
  }
}

function expectLoginAttempt(test, attempt, { allowed, hasUser = allowed }) {
  test.isTrue(attempt);

  if (!attempt) return;

  test.equal(attempt.type, LOGIN_TYPE);
  test.equal(attempt.allowed, allowed);
  test.equal(attempt.methodName, 'login');

  if (allowed) {
    test.isFalse(attempt.error);
  } else {
    test.isTrue(attempt.error);
  }

  if (hasUser) {
    test.isTrue(attempt.user);
  } else {
    test.isFalse(attempt.user);
  }

  test.isTrue(attempt.options);
  test.equal(attempt.options.foo, 'bar');
}
