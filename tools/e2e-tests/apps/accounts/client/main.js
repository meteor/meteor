import { Meteor } from 'meteor/meteor';
import { Accounts, AccountsTest } from 'meteor/accounts-base';
import { Tracker } from 'meteor/tracker';

import './react-mount.jsx';

// Playwright strips custom fields off Errors thrown in page.evaluate, so the
// `error`/`reason`/`details` properties of a Meteor.Error don't survive the
// page-to-node hop. Re-throw as a plain Error whose message embeds the
// payload as JSON; tests assert on the message via .rejects.toThrow(/.../).
function reserializeError(err) {
  if (!err) return new Error('unknown error');
  if (err.__e2e) return err;
  const payload = {
    error: err.error,
    reason: err.reason,
    details: err.details,
    errorType: err.errorType,
    isClientSafe: err.isClientSafe,
  };
  const out = new Error(
    (err.message || err.reason || String(err)) + ' | ' + JSON.stringify(payload),
  );
  out.name = err.errorType || err.name || 'Error';
  out.error = err.error;
  out.reason = err.reason;
  out.details = err.details;
  out.errorType = err.errorType;
  out.__e2e = true;
  return out;
}

function promisify(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      fn(...args, (err, result) => (err ? reject(reserializeError(err)) : resolve(result)));
    });
}

function callMethod(name, ...args) {
  return new Promise((resolve, reject) => {
    Meteor.call(name, ...args, (err, result) =>
      err ? reject(reserializeError(err)) : resolve(result),
    );
  });
}

const callbackLog = {
  onLogin: 0,
  onLoginFailure: 0,
  onLogout: 0,
  resetPasswordLink: [],
  enrollmentLink: [],
  emailVerificationLink: [],
};

Accounts.onLogin(() => {
  callbackLog.onLogin += 1;
});
Accounts.onLoginFailure(() => {
  callbackLog.onLoginFailure += 1;
});
Accounts.onLogout(() => {
  callbackLog.onLogout += 1;
});

Accounts.onResetPasswordLink((token, done) => {
  callbackLog.resetPasswordLink.push(token);
  done && done();
});
Accounts.onEnrollmentLink((token, done) => {
  callbackLog.enrollmentLink.push(token);
  done && done();
});
Accounts.onEmailVerificationLink((token, done) => {
  callbackLog.emailVerificationLink.push(token);
  done && done();
});

const api = {
  Meteor,
  Accounts,
  AccountsTest,
  Tracker,

  whoAmI: async () => ({
    userId: Meteor.userId(),
    user: await Meteor.userAsync(),
    loggingIn: Meteor.loggingIn(),
    loggingOut: Meteor.loggingOut ? Meteor.loggingOut() : false,
    connectionStatus: Meteor.status(),
  }),
  userId: () => Meteor.userId(),
  loggingIn: () => Meteor.loggingIn(),
  callbacks: () => ({
    ...callbackLog,
    resetPasswordLink: [...callbackLog.resetPasswordLink],
    enrollmentLink: [...callbackLog.enrollmentLink],
    emailVerificationLink: [...callbackLog.emailVerificationLink],
  }),
  resetCallbacks: () => {
    callbackLog.onLogin = 0;
    callbackLog.onLoginFailure = 0;
    callbackLog.onLogout = 0;
    callbackLog.resetPasswordLink.length = 0;
    callbackLog.enrollmentLink.length = 0;
    callbackLog.emailVerificationLink.length = 0;
  },

  reactRenders: () => (window.__reactRenders || []).slice(),
  resetReactRenders: () => {
    if (Array.isArray(window.__reactRenders)) window.__reactRenders.length = 0;
    else window.__reactRenders = [];
  },

  storedToken: () => {
    try {
      return localStorage.getItem('Meteor.loginToken');
    } catch {
      return null;
    }
  },
  storedTokenExpires: () => {
    try {
      return localStorage.getItem('Meteor.loginTokenExpires');
    } catch {
      return null;
    }
  },
  storedUserId: () => {
    try {
      return localStorage.getItem('Meteor.userId');
    } catch {
      return null;
    }
  },
  setStoredToken: (token, expires) => {
    try {
      if (token == null) {
        localStorage.removeItem('Meteor.loginToken');
        localStorage.removeItem('Meteor.loginTokenExpires');
      } else {
        localStorage.setItem('Meteor.loginToken', token);
        if (expires) localStorage.setItem('Meteor.loginTokenExpires', expires);
      }
    } catch {}
  },

  loginWithPassword: (selector, password) =>
    new Promise((resolve, reject) => {
      Meteor.loginWithPassword(selector, password, (err) =>
        err ? reject(reserializeError(err)) : resolve(),
      );
    }),
  loginWithPasswordAsync: (selector, password) =>
    Meteor.loginWithPasswordAsync
      ? Meteor.loginWithPasswordAsync(selector, password).catch((e) => {
          throw reserializeError(e);
        })
      : new Promise((resolve, reject) => {
          Meteor.loginWithPassword(selector, password, (err) =>
            err ? reject(reserializeError(err)) : resolve(),
          );
        }),
  loginWithPasswordAnd2faCode: (selector, password, code) =>
    new Promise((resolve, reject) => {
      Meteor.loginWithPasswordAnd2faCode(selector, password, code, (err) =>
        err ? reject(reserializeError(err)) : resolve(),
      );
    }),
  loginWithToken: (token) =>
    new Promise((resolve, reject) => {
      Meteor.loginWithToken(token, (err) => (err ? reject(reserializeError(err)) : resolve()));
    }),
  logout: () =>
    new Promise((resolve, reject) => {
      Meteor.logout((err) => (err ? reject(reserializeError(err)) : resolve()));
    }),
  logoutAsync: () =>
    (Meteor.logoutAsync ? Meteor.logoutAsync() : api.logout()).catch((e) => {
      throw reserializeError(e);
    }),
  logoutOtherClients: () =>
    new Promise((resolve, reject) => {
      Meteor.logoutOtherClients((err) =>
        err ? reject(reserializeError(err)) : resolve(),
      );
    }),

  createUser: (opts) =>
    new Promise((resolve, reject) => {
      Accounts.createUser(opts, (err) => (err ? reject(reserializeError(err)) : resolve()));
    }),
  changePassword: (oldP, newP) => promisify(Accounts.changePassword)(oldP, newP),
  forgotPassword: (opts) => promisify(Accounts.forgotPassword)(opts),
  resetPassword: (token, newPassword) => promisify(Accounts.resetPassword)(token, newPassword),
  verifyEmail: (token) => promisify(Accounts.verifyEmail)(token),

  requestLoginTokenForUser: (opts) =>
    new Promise((resolve, reject) =>
      Accounts.requestLoginTokenForUser(opts, (err, r) =>
        err ? reject(reserializeError(err)) : resolve(r),
      ),
    ),
  passwordlessLoginWithToken: (selector, token) =>
    new Promise((resolve, reject) => {
      Meteor.passwordlessLoginWithToken(selector, token, (err) =>
        err ? reject(reserializeError(err)) : resolve(),
      );
    }),

  generate2faActivationQrCode: (appName) => promisify(Accounts.generate2faActivationQrCode)(appName),
  enableUser2fa: (code) => promisify(Accounts.enableUser2fa)(code),
  disableUser2fa: () => promisify(Accounts.disableUser2fa)(),
  has2faEnabled: () => promisify(Accounts.has2faEnabled)(),

  loginWithFakeOAuth: ({ credentialToken, credentialSecret }) =>
    new Promise((resolve, reject) => {
      Accounts.callLoginMethod({
        methodArguments: [{ oauth: { credentialToken, credentialSecret } }],
        userCallback: (err) => (err ? reject(reserializeError(err)) : resolve()),
      });
    }),

  loginWithProvider: async ({ serviceName, serviceData, options }) => {
    const providers = {
      facebook: { global: 'Facebook', loginFn: 'loginWithFacebook' },
      github: { global: 'Github', loginFn: 'loginWithGithub' },
      google: { global: 'Google', loginFn: 'loginWithGoogle' },
      meetup: { global: 'Meetup', loginFn: 'loginWithMeetup' },
      'meteor-developer': {
        global: 'MeteorDeveloperAccounts',
        loginFn: 'loginWithMeteorDeveloperAccount',
      },
      twitter: { global: 'Twitter', loginFn: 'loginWithTwitter' },
      weibo: { global: 'Weibo', loginFn: 'loginWithWeibo' },
    };
    const provider = providers[serviceName];
    if (!provider) throw new Error('Unknown OAuth provider: ' + serviceName);

    const providerGlobal = window[provider.global];
    if (!providerGlobal) {
      throw new Error('Provider global ' + provider.global + ' not available on window');
    }
    const loginFn = Meteor[provider.loginFn];
    if (typeof loginFn !== 'function') {
      throw new Error('Meteor.' + provider.loginFn + ' is not a function');
    }

    const { credentialToken, credentialSecret } = await callMethod(
      '_e2e.primeOAuthCredential',
      { serviceName, serviceData, options },
    );
    // Stash the secret where Accounts.oauth.tryLoginAfterPopupClosed can find it.
    window.OAuth._handleCredentialSecret(credentialToken, credentialSecret);

    const original = providerGlobal.requestCredential;
    providerGlobal.requestCredential = (optsOrCb, maybeCb) => {
      const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
      cb(credentialToken);
    };

    try {
      await new Promise((resolve, reject) => {
        loginFn((err) => (err ? reject(reserializeError(err)) : resolve()));
      });
    } finally {
      providerGlobal.requestCredential = original;
    }
  },

  callMethod,

  disconnect: () => Meteor.disconnect(),
  reconnect: () => Meteor.reconnect(),

  subscribeMe: () =>
    new Promise((resolve) => {
      const sub = Meteor.subscribe('_e2e.me', {
        onReady: () => resolve(sub.subscriptionId),
      });
    }),
  usersFetched: () => Meteor.users.find().fetch(),
};

window.__accountsE2E = api;

// Snapshot URL state at startup. AccountsClient runs attemptToMatchHash in its
// constructor (before this module loads) and clears window.location.hash, so
// the parsed token is read from Accounts._{resetPassword,enrollAccount,verifyEmail}Token
// rather than from the URL at this point.
Meteor.startup(() => {
  window.__accountsE2E._snapshot = {
    href: window.location.href,
    hash: window.location.hash,
    savedHash: Accounts.savedHash,
    resetPasswordToken: Accounts._resetPasswordToken || null,
    enrollAccountToken: Accounts._enrollAccountToken || null,
    verifyEmailToken: Accounts._verifyEmailToken || null,
    earlyHash: window.__earlyUrl ? window.__earlyUrl.hash : null,
    earlyHref: window.__earlyUrl ? window.__earlyUrl.href : null,
  };

  Tracker.autorun(() => {
    const el = document.getElementById('state');
    if (!el) return;
    el.textContent = JSON.stringify({
      userId: Meteor.userId(),
      loggingIn: Meteor.loggingIn(),
      status: Meteor.status().status,
    });
  });
  const readyEl = document.getElementById('ready');
  if (readyEl) readyEl.setAttribute('data-ready', 'true');
});
