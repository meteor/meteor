import { Meteor } from 'meteor/meteor';

// A fake factor named `name` that is enabled when `user.services[name]` is
// set, answered through `options[name]`, and satisfied by the value "ok".
const fakeFactor = (name, overrides = {}) => ({
  isEnabledFor: user => !!user.services?.[name],
  hasInput: options => options[name] !== undefined,
  inputKey: name,
  onMissingInput: () => {
    throw new Meteor.Error(`no-${name}`, `${name} required`);
  },
  verify: (user, options) => {
    if (options[name] !== 'ok') {
      throw new Meteor.Error(`invalid-${name}`, `${name} rejected`);
    }
  },
  ...overrides,
});

async function rejectsWith(test, promise, code, message) {
  try {
    await promise;
    test.fail({ message: `expected error ${code}${message ? `: ${message}` : ''}` });
  } catch (error) {
    test.equal(error.error, code, message);
    return error;
  }
  return undefined;
}

Tinytest.add('accounts - second factors - registry validates descriptors', test => {
  test.throws(() => Accounts.registerSecondFactor('', fakeFactor('x')));
  test.throws(() => Accounts.registerSecondFactor('x', {}));
  test.throws(() => Accounts.registerSecondFactor('x', { ...fakeFactor('x'), verify: 'nope' }));

  const handle = Accounts.registerSecondFactor('alpha-test', fakeFactor('alpha-test'));
  try {
    test.throws(
      () => Accounts.registerSecondFactor('alpha-test', fakeFactor('alpha-test')),
      /already registered/
    );
    test.isTrue('alpha-test' in Accounts._secondFactorInputSchema());
  } finally {
    handle.stop();
  }
  test.isFalse('alpha-test' in Accounts._secondFactorInputSchema());
});

Tinytest.add('accounts - second factors - a stale stop handle leaves a replacement alone', test => {
  const first = Accounts.registerSecondFactor('alpha-test', fakeFactor('alpha-test'));
  first.stop();
  const second = Accounts.registerSecondFactor('alpha-test', fakeFactor('alpha-test'));
  try {
    first.stop();
    test.isTrue(
      'alpha-test' in Accounts._secondFactorInputSchema(),
      'the replacement stays registered'
    );
  } finally {
    second.stop();
  }
  test.isFalse('alpha-test' in Accounts._secondFactorInputSchema());
});

Tinytest.add('accounts - second factors - isAvailableFor defaults to isEnabledFor', test => {
  const defaulted = Accounts.registerSecondFactor('alpha-test', fakeFactor('alpha-test'));
  const explicit = Accounts.registerSecondFactor(
    'beta-test',
    fakeFactor('beta-test', { isAvailableFor: user => !!user.services?.['beta-setup'] })
  );
  try {
    const user = { services: { 'alpha-test': true, 'beta-setup': true } };
    test.equal(Accounts._enabledSecondFactors(user), ['alpha-test']);
    test.equal(Accounts._availableSecondFactors(user), ['alpha-test', 'beta-test']);
    test.equal(Accounts._availableSecondFactors({ services: {} }), []);
  } finally {
    defaulted.stop();
    explicit.stop();
  }
});

Tinytest.add('accounts - second factors - _handleError carries details', test => {
  const previous = Accounts._options.ambiguousErrorMessages;
  Accounts._options.ambiguousErrorMessages = true;
  try {
    const error = Accounts._handleError('secret reason', false, 'some-code', { x: 1 });
    test.equal(error.error, 'some-code');
    test.equal(error.details, { x: 1 });
    test.equal(error.reason, 'Something went wrong. Please check your credentials.');
  } finally {
    Accounts._options.ambiguousErrorMessages = previous;
  }
});

Tinytest.addAsync('accounts - second factors - nothing enabled is a no-op', async test => {
  const handle = Accounts.registerSecondFactor('alpha-test', fakeFactor('alpha-test'));
  try {
    await Accounts._verifySecondFactors({ services: {} }, {});
    await Accounts._verifySecondFactors({}, undefined);
    test.isTrue(true);
  } finally {
    handle.stop();
  }
});

Tinytest.addAsync(
  'accounts - second factors - a single factor keeps its own error and lists itself',
  async test => {
    const handle = Accounts.registerSecondFactor('alpha-test', fakeFactor('alpha-test'));
    try {
      const user = { services: { 'alpha-test': true } };
      const missing = await rejectsWith(
        test,
        Accounts._verifySecondFactors(user, {}),
        'no-alpha-test'
      );
      test.equal(missing.details, { availableFactors: ['alpha-test'] });
      await rejectsWith(
        test,
        Accounts._verifySecondFactors(user, { 'alpha-test': 'nope' }),
        'invalid-alpha-test'
      );
      await Accounts._verifySecondFactors(user, { 'alpha-test': 'ok' });
    } finally {
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'accounts - second factors - existing error details are preserved',
  async test => {
    const handle = Accounts.registerSecondFactor(
      'alpha-test',
      fakeFactor('alpha-test', {
        onMissingInput: () => {
          throw new Meteor.Error('no-alpha-test', 'required', { hint: 'keep me' });
        },
      })
    );
    try {
      const error = await rejectsWith(
        test,
        Accounts._verifySecondFactors({ services: { 'alpha-test': true } }, {}),
        'no-alpha-test'
      );
      test.equal(error.details, { hint: 'keep me' });
    } finally {
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'accounts - second factors - a missing-input callback that does not throw falls back to the generic error',
  async test => {
    const handle = Accounts.registerSecondFactor(
      'alpha-test',
      fakeFactor('alpha-test', { onMissingInput: () => {} })
    );
    try {
      const error = await rejectsWith(
        test,
        Accounts._verifySecondFactors({ services: { 'alpha-test': true } }, {}),
        'second-factor-required'
      );
      test.equal(error.details, { availableFactors: ['alpha-test'] });
    } finally {
      handle.stop();
    }
  }
);

Tinytest.addAsync(
  'accounts - second factors - any answered factor satisfies the check',
  async test => {
    const alpha = Accounts.registerSecondFactor('alpha-test', fakeFactor('alpha-test'));
    const beta = Accounts.registerSecondFactor('beta-test', fakeFactor('beta-test'));
    try {
      const user = { services: { 'alpha-test': true, 'beta-test': true } };

      const missing = await rejectsWith(
        test,
        Accounts._verifySecondFactors(user, {}),
        'second-factor-required'
      );
      test.equal(missing.details, { availableFactors: ['alpha-test', 'beta-test'] });

      await Accounts._verifySecondFactors(user, { 'alpha-test': 'ok' });
      await Accounts._verifySecondFactors(user, { 'beta-test': 'ok' });
      await rejectsWith(
        test,
        Accounts._verifySecondFactors(user, { 'beta-test': 'nope' }),
        'invalid-beta-test'
      );
      // Answered factors are tried in registration order until one passes;
      // when none does, the first failure is reported.
      await Accounts._verifySecondFactors(user, { 'alpha-test': 'nope', 'beta-test': 'ok' });
      await rejectsWith(
        test,
        Accounts._verifySecondFactors(user, { 'alpha-test': 'nope', 'beta-test': 'nope' }),
        'invalid-alpha-test'
      );

      // `only` restricts the check to the named factors.
      await Accounts._verifySecondFactors(user, { 'alpha-test': 'ok' }, { only: ['alpha-test'] });
      await rejectsWith(
        test,
        Accounts._verifySecondFactors(user, { 'alpha-test': 'ok' }, { only: ['beta-test'] }),
        'no-beta-test'
      );
      await Accounts._verifySecondFactors(user, {}, { only: ['gamma-test'] });

      // A factor the user has not enabled is ignored even when answered.
      await Accounts._verifySecondFactors(
        { services: { 'alpha-test': true } },
        { 'alpha-test': 'ok', 'beta-test': 'nope' }
      );
    } finally {
      alpha.stop();
      beta.stop();
    }
  }
);
