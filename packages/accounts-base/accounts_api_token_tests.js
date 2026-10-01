import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

const createUser = () => Accounts.insertUserDoc({}, { username: Random.id() });

Tinytest.addAsync('accounts - API tokens - create and list expose only token metadata', async test => {
  const userId = await createUser();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  try {
    const created = await Accounts.createApiTokenAsync(userId, {
      name: 'Reporting integration',
      expiresAt,
      scopes: ['reports:read'],
    });
    const { token, ...metadata } = created;
    test.isTrue(token.startsWith('meteor_api_'));
    test.isTrue(typeof metadata.id === 'string' && metadata.id.length > 0);
    test.equal(metadata.name, 'Reporting integration');
    test.equal(metadata.expiresAt, expiresAt);
    test.equal(metadata.scopes, ['reports:read']);
    test.instanceOf(metadata.createdAt, Date);
    test.equal(Object.keys(metadata).sort(), ['createdAt', 'expiresAt', 'id', 'name', 'scopes']);

    const user = await Meteor.users.findOneAsync(userId);
    test.equal(user.services.apiTokens, [{
      ...metadata,
      hashedToken: Accounts._hashLoginToken(token),
    }]);
    test.isUndefined(user.services.resume);
    test.equal(await Accounts.listApiTokensAsync(userId), [metadata]);
    test.equal(await Accounts._findApiToken(token), {
      userId,
      id: metadata.id,
      scopes: ['reports:read'],
      expiresAt,
    });
    test.equal(await Accounts._findApiToken(Accounts._hashLoginToken(token)), null);
    test.equal(await Accounts._findApiToken(`${token}changed`), null);
    for (const invalidToken of [null, undefined, 42, {}, '']) {
      test.equal(await Accounts._findApiToken(invalidToken), null);
    }
  } finally {
    await Meteor.users.removeAsync(userId);
  }
});

Tinytest.addAsync('accounts - API tokens - require explicit valid expiration and scopes', async test => {
  const userId = await createUser();
  try {
    for (const options of [
      { name: 'No expiration choice' },
      { name: '', expiresAt: null },
      { name: ' \t', expiresAt: null },
      { name: 'String expiration', expiresAt: new Date().toISOString() },
      { name: 'Invalid scopes', expiresAt: null, scopes: [''] },
      { name: 'Blank scope', expiresAt: null, scopes: [' \t'] },
    ]) {
      await test.throwsAsync(
        () => Accounts.createApiTokenAsync(userId, options),
        error => error.errorType === 'Match.Error'
      );
    }
    for (const expiresAt of [new Date(0), new Date(NaN)]) {
      await test.throwsAsync(
        () => Accounts.createApiTokenAsync(userId, { name: 'Invalid expiration', expiresAt }),
        error => error instanceof Meteor.Error && error.error === 400
      );
    }
    await test.throwsAsync(
      () => Accounts.createApiTokenAsync(Random.id(), { name: 'Missing user', expiresAt: null }),
      error => error instanceof Meteor.Error && error.error === 404
    );
    test.equal(await Accounts.listApiTokensAsync(userId), []);
    const user = await Meteor.users.findOneAsync(userId);
    test.isUndefined(user.services?.apiTokens);
  } finally {
    await Meteor.users.removeAsync(userId);
  }
});

Tinytest.addAsync('accounts - API tokens - explicit lifetime is independent of login expiration', async test => {
  const userId = await createUser();
  const previousLifetime = Accounts._options.loginExpirationInDays;
  const originalNow = Date.now;
  try {
    const unlimited = await Accounts.createApiTokenAsync(userId, {
      name: 'Long running integration', expiresAt: null,
    });
    const limited = await Accounts.createApiTokenAsync(userId, {
      name: 'No permissions', expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), scopes: [],
    });
    for (const id of [unlimited.id, limited.id]) {
      await Meteor.users.updateAsync(
        { _id: userId, 'services.apiTokens.id': id },
        { $set: { 'services.apiTokens.$.createdAt': new Date(0) } }
      );
    }
    Accounts._options.loginExpirationInDays = 1;
    test.equal((await Accounts._findApiToken(unlimited.token)).expiresAt, null);
    test.equal((await Accounts._findApiToken(unlimited.token)).scopes, null);
    test.equal((await Accounts._findApiToken(limited.token)).scopes, []);

    const boundary = originalNow();
    await Meteor.users.updateAsync(
      { _id: userId, 'services.apiTokens.id': limited.id },
      { $set: { 'services.apiTokens.$.expiresAt': new Date(boundary) } }
    );
    // Freeze only Date.now so both sides of the expiry boundary are exact.
    Date.now = () => boundary - 1;
    test.equal((await Accounts._findApiToken(limited.token)).id, limited.id);
    Date.now = () => boundary;
    test.equal(await Accounts._findApiToken(limited.token), null);
    test.equal((await Accounts._findApiToken(unlimited.token)).id, unlimited.id);
    const listed = await Accounts.listApiTokensAsync(userId);
    test.equal(listed.map(token => token.id), [unlimited.id, limited.id]);
    test.equal(listed.find(token => token.id === limited.id).expiresAt, new Date(boundary));
  } finally {
    Date.now = originalNow;
    if (previousLifetime === undefined) delete Accounts._options.loginExpirationInDays;
    else Accounts._options.loginExpirationInDays = previousLifetime;
    await Meteor.users.removeAsync(userId);
  }
});

Tinytest.addAsync('accounts - API tokens - malformed stored permissions and expiration fail closed', async test => {
  const userId = await createUser();
  try {
    const created = await Accounts.createApiTokenAsync(userId, {
      name: 'Integration', expiresAt: null, scopes: null,
    });
    const user = await Meteor.users.findOneAsync(userId);
    await Meteor.users.updateAsync(userId, {
      $set: { 'services.apiTokens': [null, ...user.services.apiTokens] },
    });
    test.equal((await Accounts._findApiToken(created.token)).id, created.id);
    test.equal((await Accounts.listApiTokensAsync(userId)).map(token => token.id), [created.id]);
    const selector = { _id: userId, 'services.apiTokens.id': created.id };
    for (const expiresAt of ['2099-01-01', 0, {}]) {
      await Meteor.users.updateAsync(selector, {
        $set: { 'services.apiTokens.$.expiresAt': expiresAt },
      });
      test.equal(await Accounts._findApiToken(created.token), null);
    }
    await Meteor.users.updateAsync(selector, { $unset: { 'services.apiTokens.$.expiresAt': 1 } });
    test.equal(await Accounts._findApiToken(created.token), null);

    await Meteor.users.updateAsync(selector, { $set: { 'services.apiTokens.$.expiresAt': null } });
    for (const scopes of ['reports:read', [''], [' \t']]) {
      await Meteor.users.updateAsync(selector, { $set: { 'services.apiTokens.$.scopes': scopes } });
      test.equal(await Accounts._findApiToken(created.token), null);
    }
    await Meteor.users.updateAsync(selector, { $unset: { 'services.apiTokens.$.scopes': 1 } });
    test.equal(await Accounts._findApiToken(created.token), null);
  } finally {
    await Meteor.users.removeAsync(userId);
  }
});

Tinytest.addAsync('accounts - API tokens - concurrent creation and revocation preserve unrelated credentials', async test => {
  const userId = await createUser();
  const createToken = name => Accounts.createApiTokenAsync(userId, { name, expiresAt: null });
  try {
    const [first, second] = await Promise.all([createToken('First'), createToken('Second')]);
    test.equal(
      (await Accounts.listApiTokensAsync(userId)).map(token => token.id).sort(),
      [first.id, second.id].sort()
    );

    const [surviving, removed] = await Promise.all([
      createToken('Surviving'),
      Accounts.revokeApiTokenAsync(userId, first.id),
    ]);
    test.isTrue(removed);
    const removals = await Promise.all([
      Accounts.revokeApiTokenAsync(userId, second.id),
      Accounts.revokeApiTokenAsync(userId, second.id),
    ]);
    test.equal(removals.sort(), [false, true]);
    test.equal((await Accounts.listApiTokensAsync(userId)).map(token => token.id), [surviving.id]);
    test.equal(await Accounts._findApiToken(first.token), null);
    test.equal(await Accounts._findApiToken(second.token), null);
    test.equal((await Accounts._findApiToken(surviving.token)).id, surviving.id);
  } finally {
    await Meteor.users.removeAsync(userId);
  }
});

Tinytest.addAsync('accounts - API tokens - revocation is isolated by owner and token', async test => {
  const userId = await createUser();
  const otherUserId = await createUser();
  try {
    const session = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, session);
    const first = await Accounts.createApiTokenAsync(userId, { name: 'First', expiresAt: null });
    const second = await Accounts.createApiTokenAsync(userId, { name: 'Second', expiresAt: null });
    const other = await Accounts.createApiTokenAsync(otherUserId, { name: 'Other owner', expiresAt: null });

    test.equal((await Accounts.listApiTokensAsync(userId)).map(token => token.id), [first.id, second.id]);
    test.equal((await Accounts.listApiTokensAsync(otherUserId)).map(token => token.id), [other.id]);
    test.isFalse(await Accounts.revokeApiTokenAsync(otherUserId, first.id));
    test.isTrue(await Accounts.revokeApiTokenAsync(userId, first.id));
    test.isFalse(await Accounts.revokeApiTokenAsync(userId, first.id));
    test.equal(await Accounts._findApiToken(first.token), null);
    test.equal((await Accounts._findApiToken(second.token)).id, second.id);
    test.equal((await Accounts._findApiToken(other.token)).userId, otherUserId);

    await Accounts.revokeAllApiTokensAsync(userId);
    test.equal(await Accounts.listApiTokensAsync(userId), []);
    test.equal(await Accounts._findApiToken(second.token), null);
    test.equal((await Accounts._findApiToken(other.token)).id, other.id);
    const user = await Meteor.users.findOneAsync(userId);
    test.equal(user.services.resume.loginTokens, [{
      hashedToken: Accounts._hashLoginToken(session.token), when: session.when,
    }]);

    await Meteor.users.removeAsync(otherUserId);
    test.equal(await Accounts._findApiToken(other.token), null);
  } finally {
    await Meteor.users.removeAsync(userId);
    await Meteor.users.removeAsync(otherUserId);
  }
});
