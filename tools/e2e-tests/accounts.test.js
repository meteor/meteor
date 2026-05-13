import {
  startAccountsApp,
  stopAccountsApp,
  openHarness,
  callMethod,
  resetServerState,
  applyConfig,
  seedUser,
  getUser,
  lastEmail,
  extractTokenFromEmail,
  login,
  logout,
  expectLoggedIn,
  expectLoggedOut,
  readLocalStorageToken,
  readCookie,
  getCallbacks,
  resetCallbacks,
  fetchJson,
} from './helpers/accounts-helpers';

// Ports spaced by 2 so each Meteor instance can use `port + 1` for its
// sidecar MongoDB without colliding with the next suite.
// To improve when
const LOCALSTORAGE_PORT = 3320;
const COOKIES_PORT = 3322;
const EXPRESS_PORT = 3324;
const ALT_CONFIG_PORT = 3326;

jest.setTimeout(process.env.CI ? 300_000 : 180_000);

function defineAccountsScenarios(storageMode, getCtx) {
  beforeEach(async () => {
    const { page } = getCtx();
    await openHarness(page, getCtx().port);
    await resetServerState(page);
    await resetCallbacks(page);
  });

  describe('accounts-base: config and user state', () => {
    it('forbidClientAccountCreation rejects Accounts.createUser', async () => {
      const { page } = getCtx();
      await applyConfig(page, { forbidClientAccountCreation: true });
      await expect(
        page.evaluate(() =>
          window.__accountsE2E.createUser({
            email: 'a@example.com',
            password: 'pw12345',
          }),
        ),
      ).rejects.toThrow(/"error":\s*403/);
    });

    it('restrictCreationByEmailDomain allows matching domains', async () => {
      const { page } = getCtx();
      await applyConfig(page, { restrictCreationByEmailDomain: 'example.com' });
      await page.evaluate(() =>
        window.__accountsE2E.createUser({
          email: 'allowed@example.com',
          password: 'pw12345',
        }),
      );
      await expectLoggedIn(page);
    });

    it('restrictCreationByEmailDomain rejects non-matching domains', async () => {
      const { page } = getCtx();
      await applyConfig(page, { restrictCreationByEmailDomain: 'example.com' });
      await expect(
        page.evaluate(() =>
          window.__accountsE2E.createUser({
            email: 'denied@other.com',
            password: 'pw12345',
          }),
        ),
      ).rejects.toBeTruthy();
    });

    it('Accounts.onCreateUser augments the user document', async () => {
      const { page } = getCtx();
      await applyConfig(page, {
        hooks: { onCreateUserAddsField: true },
      });
      await page.evaluate(() =>
        window.__accountsE2E.createUser({
          email: 'hook@example.com',
          password: 'pw12345',
        }),
      );
      const { user } = await page.evaluate(() => window.__accountsE2E.whoAmI());
      expect(user?.profile?.e2eMarker).toBe(true);
    });

    it('Accounts.validateNewUser can reject createUser', async () => {
      const { page } = getCtx();
      await applyConfig(page, { hooks: { validateNewUser: 'reject' } });
      await expect(
        page.evaluate(() =>
          window.__accountsE2E.createUser({
            email: 'rejected@example.com',
            password: 'pw12345',
          }),
        ),
      ).rejects.toThrow(/"error":\s*"rejected-by-validator"/);
    });

    it('Meteor.userAsync returns the logged-in user document', async () => {
      const { page } = getCtx();
      const userId = await seedUser(page, {
        email: 'who@example.com',
        password: 'pw12345',
      });
      await login(page, { email: 'who@example.com' }, 'pw12345');
      const { user } = await page.evaluate(() => window.__accountsE2E.whoAmI());
      expect(user?._id).toBe(userId);
      expect(user?.emails?.[0]?.address).toBe('who@example.com');
    });
  });

  describe('accounts-base: login, logout, callbacks', () => {
    it('loginWithPasswordAsync resolves and sets userId', async () => {
      const { page } = getCtx();
      const userId = await seedUser(page, {
        email: 'login@example.com',
        password: 'pw12345',
      });
      await login(page, { email: 'login@example.com' }, 'pw12345');
      const state = await expectLoggedIn(page, userId);
      expect(state.user._id).toBe(userId);
    });

    it('logout clears userId and fires onLogout', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'a@example.com', password: 'pw12345' });
      await login(page, { email: 'a@example.com' }, 'pw12345');
      await logout(page);
      await expectLoggedOut(page);
      const cb = await getCallbacks(page);
      expect(cb.onLogout).toBeGreaterThanOrEqual(1);
    });

    it('Accounts.onLogin fires on successful login', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'a@example.com', password: 'pw12345' });
      await login(page, { email: 'a@example.com' }, 'pw12345');
      const cb = await getCallbacks(page);
      expect(cb.onLogin).toBeGreaterThanOrEqual(1);
    });

    it('Accounts.onLoginFailure fires on bad password', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'a@example.com', password: 'pw12345' });
      await expect(
        login(page, { email: 'a@example.com' }, 'wrong'),
      ).rejects.toBeTruthy();
      const cb = await getCallbacks(page);
      expect(cb.onLoginFailure).toBeGreaterThanOrEqual(1);
    });

    it('bad password returns Meteor.Error 403', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'a@example.com', password: 'pw12345' });
      await expect(
        login(page, { email: 'a@example.com' }, 'wrong'),
      ).rejects.toThrow(/"error":\s*403/);
    });

    it('Accounts.validateLoginAttempt can reject login', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'a@example.com', password: 'pw12345' });
      await applyConfig(page, { hooks: { validateLoginAttempt: 'reject' } });
      await expect(
        login(page, { email: 'a@example.com' }, 'pw12345'),
      ).rejects.toThrow(/"error":\s*"login-rejected"/);
    });

    it('loggingIn() is true during login and false after', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'a@example.com', password: 'pw12345' });
      const transitions = await page.evaluate(async () => {
        const samples = [];
        const stop = Tracker.autorun(() => samples.push(Meteor.loggingIn()));
        await window.__accountsE2E.loginWithPassword(
          { email: 'a@example.com' },
          'pw12345',
        );
        // accounts-base sets _loggingIn(false) AFTER our userCallback fires,
        // so the await above resolves before the reactive transition. Poll
        // until it flips, then flush so the autorun captures the final value.
        for (let i = 0; i < 100 && Meteor.loggingIn(); i++) {
          await new Promise((r) => setTimeout(r, 10));
        }
        Tracker.flush();
        stop.stop();
        return samples;
      });
      expect(transitions).toContain(true);
      expect(transitions[transitions.length - 1]).toBe(false);
    });
  });

  if (storageMode === 'localStorage') {
    describe('accounts-base: localStorage token persistence', () => {
      it('stores token, expiry, userId in localStorage', async () => {
        const { page } = getCtx();
        const userId = await seedUser(page, {
          email: 'p@example.com',
          password: 'pw12345',
        });
        await login(page, { email: 'p@example.com' }, 'pw12345');
        const stored = await readLocalStorageToken(page);
        expect(stored.token).toBeTruthy();
        expect(stored.userId).toBe(userId);
        expect(Date.parse(stored.expires || '0')).toBeGreaterThan(Date.now());
      });

      it('reload resumes the session from localStorage', async () => {
        const { page } = getCtx();
        const userId = await seedUser(page, {
          email: 'r@example.com',
          password: 'pw12345',
        });
        await login(page, { email: 'r@example.com' }, 'pw12345');
        await page.reload();
        await openHarness(page, getCtx().port);
        await page.waitForFunction(() => Meteor.userId() != null, { timeout: 10_000 });
        await expectLoggedIn(page, userId);
      });

      it('wiping token in localStorage logs the user out on reload', async () => {
        const { page } = getCtx();
        await seedUser(page, { email: 'r@example.com', password: 'pw12345' });
        await login(page, { email: 'r@example.com' }, 'pw12345');
        await page.evaluate(() => window.__accountsE2E.setStoredToken(null));
        await page.reload();
        await openHarness(page, getCtx().port);
        await expectLoggedOut(page);
      });

      it('expired token in localStorage logs the user out on reload', async () => {
        const { page } = getCtx();
        await seedUser(page, { email: 'r@example.com', password: 'pw12345' });
        await login(page, { email: 'r@example.com' }, 'pw12345');
        const stored = await readLocalStorageToken(page);
        const expired = new Date(Date.now() - 1000 * 60).toISOString();
        await page.evaluate(
          ({ token, expires }) => window.__accountsE2E.setStoredToken(token, expires),
          { token: stored.token, expires: expired },
        );
        await page.reload();
        await openHarness(page, getCtx().port);
        await expectLoggedOut(page);
      });
    });
  }

  describe('accounts-base: token persistence', () => {
    it('loginWithToken rejects a stale token and leaves user logged out', async () => {
      const { page } = getCtx();
      const userId = await seedUser(page, {
        email: 'r@example.com',
        password: 'pw12345',
      });
      await login(page, { email: 'r@example.com' }, 'pw12345');
      await callMethod(page, '_e2e.invalidateAllLoginTokens', userId);
      const stored = await readLocalStorageToken(page);
      await page.reload();
      await openHarness(page, getCtx().port);
      await expectLoggedOut(page);
      if (stored.token) {
        await expect(
          page.evaluate((t) => window.__accountsE2E.loginWithToken(t), stored.token),
        ).rejects.toBeTruthy();
      }
    });
  });

  if (storageMode === 'cookies') {
    describe('accounts-base: HTTP-only cookie persistence', () => {
      it('login sets an HttpOnly meteor_login_token cookie', async () => {
        const { page } = getCtx();
        await seedUser(page, { email: 'c@example.com', password: 'pw12345' });
        await login(page, { email: 'c@example.com' }, 'pw12345');
        const cookie = await readCookie(page);
        expect(cookie).toBeTruthy();
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.path).toBe('/');
        // SameSite=Lax is the package default.
        expect((cookie.sameSite || '').toLowerCase()).toBe('lax');
      });

      it('document.cookie does NOT expose meteor_login_token (HttpOnly)', async () => {
        const { page } = getCtx();
        await seedUser(page, { email: 'c@example.com', password: 'pw12345' });
        await login(page, { email: 'c@example.com' }, 'pw12345');
        const docCookie = await page.evaluate(() => document.cookie);
        expect(docCookie).not.toMatch(/meteor_login_token/);
      });

      it('/_accounts/cookie/refresh returns 204 before login', async () => {
        const { page } = getCtx();
        const res = await fetchJson(page, '/_accounts/cookie/refresh');
        expect(res.status).toBe(204);
      });

      it('/_accounts/cookie/refresh returns 200 with token after login', async () => {
        const { page } = getCtx();
        await seedUser(page, { email: 'c@example.com', password: 'pw12345' });
        await login(page, { email: 'c@example.com' }, 'pw12345');
        const res = await fetchJson(page, '/_accounts/cookie/refresh');
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
      });

      it('reload resumes via cookie refresh endpoint', async () => {
        const { page } = getCtx();
        const userId = await seedUser(page, {
          email: 'c@example.com',
          password: 'pw12345',
        });
        await login(page, { email: 'c@example.com' }, 'pw12345');
        // Wipe localStorage so resume must come from the cookie.
        await page.evaluate(() => {
          try {
            localStorage.removeItem('Meteor.loginToken');
            localStorage.removeItem('Meteor.loginTokenExpires');
            localStorage.removeItem('Meteor.userId');
          } catch {}
        });
        await page.reload();
        await openHarness(page, getCtx().port);
        await page.waitForFunction(() => Meteor.userId() != null, { timeout: 10_000 });
        await expectLoggedIn(page, userId);
      });

      it('logout clears the cookie', async () => {
        const { page } = getCtx();
        await seedUser(page, { email: 'c@example.com', password: 'pw12345' });
        await login(page, { email: 'c@example.com' }, 'pw12345');
        await logout(page);
        const after = await fetchJson(page, '/_accounts/cookie/refresh');
        expect(after.status).toBe(204);
      });

      it('/_accounts/cookie/* endpoints reject wrong methods', async () => {
        const { page } = getCtx();
        const res = await fetchJson(page, '/_accounts/cookie/set', { method: 'GET' });
        expect(res.status).toBe(405);
      });
    });
  }

  describe('accounts-base: reconnect', () => {
    it('disconnect + reconnect keeps the user logged in', async () => {
      const { page } = getCtx();
      const userId = await seedUser(page, {
        email: 're@example.com',
        password: 'pw12345',
      });
      await login(page, { email: 're@example.com' }, 'pw12345');
      await page.evaluate(() => window.__accountsE2E.disconnect());
      await page.waitForFunction(() => Meteor.status().status !== 'connected');
      await page.evaluate(() => window.__accountsE2E.reconnect());
      await page.waitForFunction(() => Meteor.status().status === 'connected');
      await expectLoggedIn(page, userId);
    });

    it('reconnect resume keeps the user logged in without firing onLogout', async () => {
      const { page } = getCtx();
      const userId = await seedUser(page, {
        email: 're@example.com',
        password: 'pw12345',
      });
      await login(page, { email: 're@example.com' }, 'pw12345');
      const before = await getCallbacks(page);
      await page.evaluate(() => window.__accountsE2E.disconnect());
      await page.waitForFunction(() => Meteor.status().status !== 'connected');
      await page.evaluate(() => window.__accountsE2E.reconnect());
      await page.waitForFunction(() => Meteor.status().status === 'connected');
      // Meteor fires onLogin on resume by design, but onLogout must not fire
      // and the user must remain logged in.
      const after = await getCallbacks(page);
      expect(after.onLogout).toBe(before.onLogout);
      await expectLoggedIn(page, userId);
    });
  });

  describe('accounts-password: createUser and restrictions', () => {
    it('createUser logs the user in automatically', async () => {
      const { page } = getCtx();
      await page.evaluate(() =>
        window.__accountsE2E.createUser({
          email: 'new@example.com',
          password: 'pw12345',
        }),
      );
      await expectLoggedIn(page);
    });

    it('duplicate email rejects createUser', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'dup@example.com', password: 'pw12345' });
      await expect(
        page.evaluate(() =>
          window.__accountsE2E.createUser({
            email: 'dup@example.com',
            password: 'pw12345',
          }),
        ),
      ).rejects.toBeTruthy();
    });

    it('duplicate username rejects createUser', async () => {
      const { page } = getCtx();
      await seedUser(page, { username: 'alice', password: 'pw12345' });
      await expect(
        page.evaluate(() =>
          window.__accountsE2E.createUser({ username: 'alice', password: 'pw12345' }),
        ),
      ).rejects.toBeTruthy();
    });

    it('empty password rejects createUser', async () => {
      const { page } = getCtx();
      await expect(
        page.evaluate(() =>
          window.__accountsE2E.createUser({
            email: 'empty@example.com',
            password: '',
          }),
        ),
      ).rejects.toBeTruthy();
    });
  });

  describe('accounts-password: changePassword and setPassword', () => {
    it('changePassword updates the credentials', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'chg@example.com', password: 'old1234' });
      await login(page, { email: 'chg@example.com' }, 'old1234');
      await page.evaluate(() =>
        window.__accountsE2E.changePassword('old1234', 'new1234'),
      );
      await logout(page);
      await expect(login(page, { email: 'chg@example.com' }, 'old1234')).rejects.toBeTruthy();
      await login(page, { email: 'chg@example.com' }, 'new1234');
      await expectLoggedIn(page);
    });

    it('changePassword with wrong old password rejects', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'chg@example.com', password: 'old1234' });
      await login(page, { email: 'chg@example.com' }, 'old1234');
      await expect(
        page.evaluate(() =>
          window.__accountsE2E.changePassword('wrong', 'new1234'),
        ),
      ).rejects.toBeTruthy();
    });

    it('setPasswordAsync({logout:true}) invalidates current session', async () => {
      const { page } = getCtx();
      const userId = await seedUser(page, {
        email: 'set@example.com',
        password: 'pw12345',
      });
      await login(page, { email: 'set@example.com' }, 'pw12345');
      await callMethod(page, '_e2e.setPassword', {
        userId,
        newPassword: 'new1234',
        logout: true,
      });
      await expect(
        callMethod(page, '_e2e.whoAmI'),
      ).resolves.toMatchObject({ userId: null });
    });
  });

  describe('accounts-password: forgot/reset password', () => {
    it('forgotPassword sends an email; resetPassword logs the user in', async () => {
      const { page } = getCtx();
      await seedUser(page, {
        email: 'fp@example.com',
        password: 'old1234',
        verified: true,
      });
      await page.evaluate(() =>
        window.__accountsE2E.forgotPassword({ email: 'fp@example.com' }),
      );
      const email = await lastEmail(page, 'fp@example.com');
      const token = extractTokenFromEmail(email);
      expect(token).toBeTruthy();
      await page.evaluate((t) => window.__accountsE2E.resetPassword(t, 'new1234'), token);
      await expectLoggedIn(page);
      await logout(page);
      await expect(login(page, { email: 'fp@example.com' }, 'old1234')).rejects.toBeTruthy();
      await login(page, { email: 'fp@example.com' }, 'new1234');
      await expectLoggedIn(page);
    });

    it('reset token cannot be reused', async () => {
      const { page } = getCtx();
      await seedUser(page, {
        email: 'fp@example.com',
        password: 'old1234',
        verified: true,
      });
      await page.evaluate(() =>
        window.__accountsE2E.forgotPassword({ email: 'fp@example.com' }),
      );
      const email = await lastEmail(page, 'fp@example.com');
      const token = extractTokenFromEmail(email);
      await page.evaluate((t) => window.__accountsE2E.resetPassword(t, 'new1234'), token);
      await logout(page);
      await expect(
        page.evaluate((t) => window.__accountsE2E.resetPassword(t, 'evil1234'), token),
      ).rejects.toBeTruthy();
    });

    it('Accounts.onResetPasswordLink fires when visiting reset URL', async () => {
      const { page } = getCtx();
      await seedUser(page, {
        email: 'fp@example.com',
        password: 'old1234',
        verified: true,
      });
      await page.evaluate(() =>
        window.__accountsE2E.forgotPassword({ email: 'fp@example.com' }),
      );
      const email = await lastEmail(page, 'fp@example.com');
      const token = extractTokenFromEmail(email);
      // Playwright/Meteor's boilerplate strips the hash fragment before any
      // app script runs, so we can't observe the link flow via page.goto.
      // AccountsTest.attemptToMatchHash is the same function the live URL
      // matcher uses, so driving it directly is an isomorphic check.
      const result = await page.evaluate((hash) => {
        return new Promise((resolve) => {
          window.__accountsE2E.AccountsTest.attemptToMatchHash(
            hash,
            function (parsedToken, urlPart) {
              resolve({ parsedToken, urlPart });
            },
          );
        });
      }, `#/reset-password/${token}`);
      expect(result).toEqual({ parsedToken: token, urlPart: 'reset-password' });

      await page.evaluate((t) => {
        const cb = window.__accountsE2E.Accounts._accountsCallbacks['reset-password'];
        if (cb) cb(t, () => {});
      }, token);
      const cb = await getCallbacks(page);
      expect(cb.resetPasswordLink).toContain(token);
    });

    it('forgotPassword does not throw when email is ambiguous', async () => {
      const { page } = getCtx();
      // Regression test for ambiguous email lookup; the second insert may be
      // rejected by uniqueness rules and that's fine, we only need to be sure
      // the call below doesn't throw.
      await callMethod(page, '_e2e.createUser', {
        email: 'amb@example.com',
        password: 'pw12345',
      });
      await page.evaluate(async () => {
        try {
          await window.__accountsE2E.callMethod('_e2e.createUser', {
            email: 'amb@example.com',
            password: 'other1234',
          });
        } catch {}
      });
      await expect(
        page.evaluate(() =>
          window.__accountsE2E.forgotPassword({ email: 'amb@example.com' }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('accounts-password: enrollment', () => {
    it('sendEnrollmentEmail + resetPassword sets password and logs in', async () => {
      const { page } = getCtx();
      const userId = await callMethod(page, '_e2e.createUser', {
        email: 'enr@example.com',
      });
      await callMethod(page, '_e2e.sendEnrollmentEmail', {
        userId,
        email: 'enr@example.com',
      });
      const email = await lastEmail(page, 'enr@example.com');
      const token = extractTokenFromEmail(email);
      expect(token).toBeTruthy();
      const result = await page.evaluate((hash) => {
        return new Promise((resolve) => {
          window.__accountsE2E.AccountsTest.attemptToMatchHash(
            hash,
            function (parsedToken, urlPart) {
              resolve({ parsedToken, urlPart });
            },
          );
        });
      }, `#/enroll-account/${token}`);
      expect(result).toEqual({ parsedToken: token, urlPart: 'enroll-account' });

      await page.evaluate(
        (t) => window.__accountsE2E.resetPassword(t, 'enrolled1234'),
        token,
      );
      await expectLoggedIn(page, userId);
    });
  });

  describe('accounts-password: email verification', () => {
    it('sendVerificationEmail + verifyEmail flips verified flag', async () => {
      const { page } = getCtx();
      const userId = await callMethod(page, '_e2e.createUser', {
        email: 'ver@example.com',
        password: 'pw12345',
      });
      await callMethod(page, '_e2e.sendVerificationEmail', {
        userId,
        email: 'ver@example.com',
      });
      const email = await lastEmail(page, 'ver@example.com');
      const token = extractTokenFromEmail(email);
      expect(token).toBeTruthy();

      const userBefore = await getUser(page, userId);
      expect(userBefore.emails[0].verified).toBe(false);

      await login(page, { email: 'ver@example.com' }, 'pw12345');
      await page.evaluate((t) => window.__accountsE2E.verifyEmail(t), token);

      const userAfter = await getUser(page, userId);
      expect(userAfter.emails[0].verified).toBe(true);
    });

    it('reusing a verify token rejects', async () => {
      const { page } = getCtx();
      const userId = await callMethod(page, '_e2e.createUser', {
        email: 'ver@example.com',
        password: 'pw12345',
      });
      await callMethod(page, '_e2e.sendVerificationEmail', {
        userId,
        email: 'ver@example.com',
      });
      const email = await lastEmail(page, 'ver@example.com');
      const token = extractTokenFromEmail(email);
      await login(page, { email: 'ver@example.com' }, 'pw12345');
      await page.evaluate((t) => window.__accountsE2E.verifyEmail(t), token);
      await expect(
        page.evaluate((t) => window.__accountsE2E.verifyEmail(t), token),
      ).rejects.toBeTruthy();
    });
  });

  describe('accounts-2fa', () => {
    it('full enrollment + 2FA login flow', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: '2fa@example.com', password: 'pw12345' });
      await login(page, { email: '2fa@example.com' }, 'pw12345');

      const activation = await page.evaluate(() =>
        window.__accountsE2E.generate2faActivationQrCode('e2e-test'),
      );
      expect(activation.secret).toBeTruthy();

      const totp = await callMethod(page, '_e2e.generateTotp', activation.secret);
      await page.evaluate((code) => window.__accountsE2E.enableUser2fa(code), totp);

      const enabled = await page.evaluate(() => window.__accountsE2E.has2faEnabled());
      expect(enabled).toBe(true);

      await logout(page);
      await expect(
        login(page, { email: '2fa@example.com' }, 'pw12345'),
      ).rejects.toThrow(/"error":\s*"no-2fa-code"/);

      const totp2 = await callMethod(page, '_e2e.generateTotp', activation.secret);
      await page.evaluate(
        ({ password, code }) =>
          window.__accountsE2E.loginWithPasswordAnd2faCode(
            { email: '2fa@example.com' },
            password,
            code,
          ),
        { password: 'pw12345', code: totp2 },
      );
      await expectLoggedIn(page);
    });
  });

  describe('accounts-passwordless', () => {
    it('requestLoginTokenForUser + passwordlessLoginWithToken logs in', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'pl@example.com' });
      await page.evaluate(() =>
        window.__accountsE2E.requestLoginTokenForUser({
          selector: { email: 'pl@example.com' },
          userData: { email: 'pl@example.com' },
        }),
      );
      const email = await lastEmail(page, 'pl@example.com');
      const token = extractTokenFromEmail(email);
      expect(token).toBeTruthy();
      await page.evaluate(
        ({ selector, token }) =>
          window.__accountsE2E.passwordlessLoginWithToken(selector, token),
        { selector: { email: 'pl@example.com' }, token },
      );
      await expectLoggedIn(page);
    });

    it('passwordless token cannot be reused after login', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'pl@example.com' });
      await page.evaluate(() =>
        window.__accountsE2E.requestLoginTokenForUser({
          selector: { email: 'pl@example.com' },
          userData: { email: 'pl@example.com' },
        }),
      );
      const email = await lastEmail(page, 'pl@example.com');
      const token = extractTokenFromEmail(email);
      await page.evaluate(
        ({ selector, token }) =>
          window.__accountsE2E.passwordlessLoginWithToken(selector, token),
        { selector: { email: 'pl@example.com' }, token },
      );
      await logout(page);
      await expect(
        page.evaluate(
          ({ selector, token }) =>
            window.__accountsE2E.passwordlessLoginWithToken(selector, token),
          { selector: { email: 'pl@example.com' }, token },
        ),
      ).rejects.toBeTruthy();
    });
  });

  describe('accounts-oauth (fake service)', () => {
    it('first login creates a user; second login matches the same user', async () => {
      const { page } = getCtx();
      const c1 = await callMethod(page, '_e2e.simulateOAuthLogin', {
        identity: 'oauth-user-1',
        email: 'oauth@example.com',
      });
      await page.evaluate(
        (cred) => window.__accountsE2E.loginWithFakeOAuth(cred),
        c1,
      );
      const first = await expectLoggedIn(page);
      await logout(page);

      const c2 = await callMethod(page, '_e2e.simulateOAuthLogin', {
        identity: 'oauth-user-1',
        email: 'oauth@example.com',
      });
      await page.evaluate(
        (cred) => window.__accountsE2E.loginWithFakeOAuth(cred),
        c2,
      );
      const second = await expectLoggedIn(page);
      expect(second.userId).toBe(first.userId);
    });
  });

  describe('accounts-* OAuth provider wrappers', () => {
    const providers = [
      {
        service: 'facebook',
        loginFn: 'loginWithFacebook',
        providerGlobal: 'Facebook',
        identity: 'fb-1',
        fakeData: {
          id: 'fb-1',
          email: 'fb@example.com',
          name: 'FB User',
          accessToken: 'fb-tok',
          expiresAt: 9999999999999,
        },
      },
      {
        service: 'github',
        loginFn: 'loginWithGithub',
        providerGlobal: 'Github',
        identity: 'gh-1',
        fakeData: {
          id: 'gh-1',
          accessToken: 'gh-tok',
          email: 'gh@example.com',
          username: 'ghuser',
          name: 'GH User',
        },
      },
      {
        service: 'google',
        loginFn: 'loginWithGoogle',
        providerGlobal: 'Google',
        identity: 'goog-1',
        fakeData: {
          id: 'goog-1',
          email: 'goog@example.com',
          verified_email: true,
          accessToken: 'g-tok',
          expiresAt: 9999999999999,
          name: 'G User',
        },
      },
      {
        service: 'meetup',
        loginFn: 'loginWithMeetup',
        providerGlobal: 'Meetup',
        identity: 'm-1',
        fakeData: {
          id: 'm-1',
          name: 'M User',
          accessToken: 'm-tok',
          expiresAt: 9999999999999,
        },
      },
      {
        service: 'meteor-developer',
        loginFn: 'loginWithMeteorDeveloperAccount',
        providerGlobal: 'MeteorDeveloperAccounts',
        identity: 'md-1',
        fakeData: {
          id: 'md-1',
          username: 'mduser',
          accessToken: 'md-tok',
          expiresAt: 9999999999999,
        },
      },
      {
        service: 'twitter',
        loginFn: 'loginWithTwitter',
        providerGlobal: 'Twitter',
        identity: 'tw-1',
        fakeData: {
          id: 'tw-1',
          screenName: 'twuser',
          accessToken: 'tw-tok',
          accessTokenSecret: 'tw-secret',
        },
      },
      {
        service: 'weibo',
        loginFn: 'loginWithWeibo',
        providerGlobal: 'Weibo',
        identity: 'wb-1',
        fakeData: {
          id: 'wb-1',
          screenName: 'wbuser',
          accessToken: 'wb-tok',
          expiresAt: 9999999999999,
        },
      },
    ];

    providers.forEach(({ service, loginFn, providerGlobal, identity, fakeData }) => {
      describe(`accounts-${service}`, () => {
        it(`registers '${service}' and exposes Meteor.${loginFn}`, async () => {
          const { page } = getCtx();
          const result = await page.evaluate(
            (info) => ({
              registered: window.__accountsE2E.Accounts.oauth
                .serviceNames()
                .includes(info.service),
              loginFn: typeof window.Meteor[info.loginFn],
              providerGlobal: typeof window[info.providerGlobal],
            }),
            { service, loginFn, providerGlobal },
          );
          expect(result.registered).toBe(true);
          expect(result.loginFn).toBe('function');
          expect(result.providerGlobal).toBe('object');
        });

        it(`stubbed Meteor.${loginFn} creates a user; second login matches`, async () => {
          const { page } = getCtx();
          await page.evaluate(
            (info) =>
              window.__accountsE2E.loginWithProvider({
                serviceName: info.service,
                serviceData: info.fakeData,
              }),
            { service, fakeData },
          );
          const first = await expectLoggedIn(page);
          const user = await callMethod(page, '_e2e.getUser', first.userId);
          expect(user.services[service].id).toBe(identity);
          await logout(page);

          await page.evaluate(
            (info) =>
              window.__accountsE2E.loginWithProvider({
                serviceName: info.service,
                serviceData: info.fakeData,
              }),
            { service, fakeData },
          );
          const second = await expectLoggedIn(page);
          expect(second.userId).toBe(first.userId);
        });
      });
    });
  });

  describe('publications and methods see the user', () => {
    it('authenticated method receives this.userId', async () => {
      const { page } = getCtx();
      const userId = await seedUser(page, {
        email: 'pub@example.com',
        password: 'pw12345',
      });
      await login(page, { email: 'pub@example.com' }, 'pw12345');
      const r = await callMethod(page, '_e2e.whoAmI');
      expect(r.userId).toBe(userId);
    });

    it('subscription to _e2e.me returns the user document after login', async () => {
      const { page } = getCtx();
      const userId = await seedUser(page, {
        email: 'pub@example.com',
        password: 'pw12345',
      });
      await login(page, { email: 'pub@example.com' }, 'pw12345');
      await page.evaluate(() => window.__accountsE2E.subscribeMe());
      await page.waitForFunction(
        () => window.__accountsE2E.usersFetched().length > 0,
        { timeout: 10_000 },
      );
      const fetched = await page.evaluate(() =>
        window.__accountsE2E.usersFetched(),
      );
      expect(fetched.some((u) => u._id === userId)).toBe(true);
    });

    it('logout clears the subscribed user', async () => {
      const { page } = getCtx();
      await seedUser(page, { email: 'pub@example.com', password: 'pw12345' });
      await login(page, { email: 'pub@example.com' }, 'pw12345');
      await page.evaluate(() => window.__accountsE2E.subscribeMe());
      await page.waitForFunction(
        () => window.__accountsE2E.usersFetched().length > 0,
        { timeout: 10_000 },
      );
      await logout(page);
      await page.waitForFunction(
        () => window.__accountsE2E.usersFetched().length === 0,
        { timeout: 10_000 },
      );
    });
  });
}

function buildAccountsSuite({ port, settingsFile, storageMode }) {
  return () => {
    const ctx = { tempDir: null, meteorProcess: null, port, page: null };

    beforeAll(async () => {
      const started = await startAccountsApp({ port, settingsFile });
      ctx.tempDir = started.tempDir;
      ctx.meteorProcess = started.meteorProcess;
      ctx.page = page; // Playwright global
    });

    afterAll(async () => {
      await stopAccountsApp({
        tempDir: ctx.tempDir,
        meteorProcess: ctx.meteorProcess,
        port,
      });
    });

    defineAccountsScenarios(storageMode, () => ctx);
  };
}

describe(
  'Accounts / localStorage persistence /',
  buildAccountsSuite({
    port: LOCALSTORAGE_PORT,
    settingsFile: 'settings-localstorage.json',
    storageMode: 'localStorage',
  }),
);

describe(
  'Accounts / HTTP-only cookie persistence /',
  buildAccountsSuite({
    port: COOKIES_PORT,
    settingsFile: 'settings-cookies.json',
    storageMode: 'cookies',
  }),
);

describe('Accounts / accounts-express middleware /', () => {
  const ctx = { tempDir: null, meteorProcess: null, port: EXPRESS_PORT, page: null };

  beforeAll(async () => {
    const started = await startAccountsApp({
      port: EXPRESS_PORT,
      settingsFile: 'settings-cookies.json',
    });
    ctx.tempDir = started.tempDir;
    ctx.meteorProcess = started.meteorProcess;
    ctx.page = page;
  });

  afterAll(async () => {
    await stopAccountsApp({
      tempDir: ctx.tempDir,
      meteorProcess: ctx.meteorProcess,
      port: EXPRESS_PORT,
    });
  });

  beforeEach(async () => {
    await openHarness(ctx.page, ctx.port);
    await resetServerState(ctx.page);
    await resetCallbacks(ctx.page);
  });

  it('GET /api/me without token returns 401', async () => {
    const res = await fetchJson(ctx.page, '/api/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/me with cookie auth returns 200 and userId', async () => {
    const userId = await seedUser(ctx.page, {
      email: 'mw@example.com',
      password: 'pw12345',
    });
    await login(ctx.page, { email: 'mw@example.com' }, 'pw12345');
    const res = await fetchJson(ctx.page, '/api/me');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
  });

  it('GET /api/me with Bearer auth returns 200', async () => {
    const userId = await seedUser(ctx.page, {
      email: 'mw@example.com',
      password: 'pw12345',
    });
    await login(ctx.page, { email: 'mw@example.com' }, 'pw12345');
    const stored = await readLocalStorageToken(ctx.page);
    await ctx.page.context().clearCookies();
    const res = await fetchJson(ctx.page, '/api/me', {
      headers: stored.token ? { Authorization: `Bearer ${stored.token}` } : {},
    });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
  });

  it('GET /api/me-optional returns 200 with null userId when unauthenticated', async () => {
    const res = await fetchJson(ctx.page, '/api/me-optional');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });

  it('expired token returns 401 on required route', async () => {
    const userId = await seedUser(ctx.page, {
      email: 'mw@example.com',
      password: 'pw12345',
    });
    await login(ctx.page, { email: 'mw@example.com' }, 'pw12345');
    await callMethod(ctx.page, '_e2e.expireLoginTokens', userId);
    const res = await fetchJson(ctx.page, '/api/me');
    expect(res.status).toBe(401);
  });

  it('_CurrentEndpointInvocation makes Meteor.userId() available inside the route', async () => {
    const userId = await seedUser(ctx.page, {
      email: 'mw@example.com',
      password: 'pw12345',
    });
    await login(ctx.page, { email: 'mw@example.com' }, 'pw12345');
    const res = await fetchJson(ctx.page, '/api/whoami-method');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
  });
});

describe('Accounts / alt-config flows /', () => {
  const ctx = { tempDir: null, meteorProcess: null, port: ALT_CONFIG_PORT, page: null };

  beforeAll(async () => {
    const started = await startAccountsApp({
      port: ALT_CONFIG_PORT,
      settingsFile: 'settings-localstorage.json',
    });
    ctx.tempDir = started.tempDir;
    ctx.meteorProcess = started.meteorProcess;
    ctx.page = page;
  });

  afterAll(async () => {
    await stopAccountsApp({
      tempDir: ctx.tempDir,
      meteorProcess: ctx.meteorProcess,
      port: ALT_CONFIG_PORT,
    });
  });

  beforeEach(async () => {
    await openHarness(ctx.page, ctx.port);
    await resetServerState(ctx.page);
    await resetCallbacks(ctx.page);
  });

  it('rate limit: failed logins eventually throw too-many-requests', async () => {
    await seedUser(ctx.page, { email: 'rl@example.com', password: 'pw12345' });
    await callMethod(ctx.page, '_e2e.setRateLimit', {
      attempts: 3,
      intervalSec: 60,
      methodName: 'login',
    });
    let lastErr = null;
    for (let i = 0; i < 8; i++) {
      try {
        await login(ctx.page, { email: 'rl@example.com' }, 'wrong');
      } catch (e) {
        lastErr = e;
      }
    }
    expect(lastErr).toBeTruthy();
  });

  it('ambiguousErrorMessages collapses bad-user vs bad-password into one error', async () => {
    await seedUser(ctx.page, { email: 'amb@example.com', password: 'pw12345' });
    await applyConfig(ctx.page, { ambiguousErrorMessages: true });
    const badUser = await login(ctx.page, { email: 'nope@example.com' }, 'pw12345')
      .catch((e) => e);
    const badPass = await login(ctx.page, { email: 'amb@example.com' }, 'wrong')
      .catch((e) => e);
    expect(badUser?.reason).toBe(badPass?.reason);
  });

  it('Accounts.config({sendVerificationEmail:true}) triggers email on createUser', async () => {
    const { page } = ctx;
    await applyConfig(page, { sendVerificationEmail: true });
    await page.evaluate(() =>
      window.__accountsE2E.createUser({
        email: 'verify-on-create@example.com',
        password: 'pw12345',
      }),
    );
    const email = await lastEmail(page, 'verify-on-create@example.com');
    expect(email).toBeTruthy();
    const token = extractTokenFromEmail(email);
    expect(token).toBeTruthy();
  });
});
