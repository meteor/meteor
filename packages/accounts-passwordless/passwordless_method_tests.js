import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import { DDP } from 'meteor/ddp';

const METHOD = 'requestLoginTokenForUser';

const isMatchFailed = err => !!err && err.error === 400 && err.reason === 'Match failed';

const withConnection = async fn => {
  const conn = DDP.connect(Meteor.absoluteUrl());
  try {
    return await fn(conn);
  } finally {
    conn.disconnect();
  }
};

const seedUser = async () => {
  const email = `${Random.id()}@example.com`.toLowerCase();
  const username = Random.id();
  const userId = await Accounts.insertUserDoc(
    {},
    { username, emails: [{ address: email, verified: false }] }
  );
  return { userId, email, username };
};

Tinytest.addAsync(
  'passwordless - requestLoginTokenForUser rejects operator selectors',
  async test => {
    await withConnection(async conn => {
      await test.throwsAsync(
        () => conn.callAsync(METHOD, {
          selector: { id: { 'profile.displayName': { $regex: '^a' } } },
        }),
        isMatchFailed,
        'operator object under selector.id'
      );
      await test.throwsAsync(
        () => conn.callAsync(METHOD, { selector: { username: { $regex: '^a' } } }),
        isMatchFailed,
        'operator object under selector.username'
      );
      await test.throwsAsync(
        () => conn.callAsync(METHOD, { selector: { email: { $ne: null } } }),
        isMatchFailed,
        'operator object under selector.email'
      );
      await test.throwsAsync(
        () => conn.callAsync(METHOD, { selector: { $or: [{ email: 'a@b.c' }] } }),
        isMatchFailed,
        'top-level operator selector'
      );
    });
  }
);

Tinytest.addAsync(
  'passwordless - requestLoginTokenForUser rejects malformed selectors',
  async test => {
    await withConnection(async conn => {
      await test.throwsAsync(
        () => conn.callAsync(METHOD, { selector: { email: 'a@b.com', username: 'a' } }),
        isMatchFailed,
        'selector must have exactly one field'
      );
      await test.throwsAsync(
        () => conn.callAsync(METHOD, {
          selector: { email: 'a@b.com', 'profile.displayName': { $regex: '^a' } },
        }),
        isMatchFailed,
        'extra selector keys are rejected'
      );
      await test.throwsAsync(
        () => conn.callAsync(METHOD, { selector: {} }),
        isMatchFailed,
        'empty selector'
      );
      await test.throwsAsync(
        () => conn.callAsync(METHOD, { selector: 'a@b.com' }),
        isMatchFailed,
        'non-object selector'
      );
    });
  }
);

Tinytest.addAsync(
  'passwordless - requestLoginTokenForUser validates its whole payload',
  async test => {
    await withConnection(async conn => {
      await test.throwsAsync(
        () => conn.callAsync(METHOD, undefined),
        isMatchFailed,
        'missing payload is 400, not a 500 TypeError'
      );
      await test.throwsAsync(
        () => conn.callAsync(METHOD, 'nope'),
        isMatchFailed,
        'non-object payload'
      );
      await test.throwsAsync(
        () => conn.callAsync(METHOD, {}),
        isMatchFailed,
        'missing selector'
      );
      await test.throwsAsync(
        () => conn.callAsync(METHOD, { selector: { email: 'a@b.com' }, bogus: 1 }),
        isMatchFailed,
        'unknown top-level key'
      );
    });
  }
);

Tinytest.addAsync(
  'passwordless - requestLoginTokenForUser rejects operator userData',
  async test => {
    await withConnection(async conn => {
      await test.throwsAsync(
        () => conn.callAsync(METHOD, {
          selector: { email: `${Random.id()}@example.com` },
          userData: { username: { $gt: '' } },
        }),
        isMatchFailed,
        'operator object under userData.username'
      );
    });
  }
);

Tinytest.addAsync(
  'passwordless - requestLoginTokenForUser accepts legitimate selectors',
  async test => {
    const savedHook = Accounts._onCreateLoginTokenHook;
    Accounts._onCreateLoginTokenHook = () => false; // suppress the email send
    const created = [];
    try {
      const a = await seedUser();
      created.push(a.userId);
      await withConnection(conn =>
        conn.callAsync(METHOD, { selector: { email: a.email } })
      );

      const b = await seedUser();
      created.push(b.userId);
      await withConnection(conn =>
        conn.callAsync(METHOD, { selector: { username: b.username } })
      );

      const c = await seedUser();
      created.push(c.userId);
      await test.doesNotThrowsAsync(
        () =>
          withConnection(conn =>
            conn.callAsync(METHOD, {
              selector: { email: c.email },
              userData: { email: c.email, username: null },
            })
          ),
        'bundled-UI shape (userData.username === null) is accepted'
      );
    } finally {
      Accounts._onCreateLoginTokenHook = savedHook;
      for (const id of created) {
        await Meteor.users.removeAsync(id);
      }
    }
  }
);
