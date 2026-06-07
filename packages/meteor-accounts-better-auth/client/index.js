import { Meteor } from "meteor/meteor";
import { Accounts } from "meteor/accounts-base";
import { Tracker } from "meteor/tracker";

const DEFAULT_COOKIE_NAME = "better-auth.session_token";
const DEFAULT_RECONNECT_TIMEOUT_MS = 2000;

let authClientInstance = null;

function getCookie(name) {
  const cookies = document.cookie.split(";");

  for (const cookie of cookies) {
    const eqIdx = cookie.indexOf("=");

    if (eqIdx < 0) {
      continue;
    }

    const key = cookie.substring(0, eqIdx).trim();

    if (key === name) {
      return decodeURIComponent(cookie.substring(eqIdx + 1).trim());
    }
  }

  return null;
}

function unwrapBetterAuthError(result, fallbackMessage) {
  if (result?.error) {
    throw new Meteor.Error(
      result.error.status || 400,
      result.error.message || fallbackMessage
    );
  }

  return result?.data ?? null;
}

Accounts.setBetterAuthClient = function setBetterAuthClient(client) {
  authClientInstance = client;
};

Accounts.getBetterAuthClient = function getBetterAuthClient() {
  if (!authClientInstance) {
    throw new Error(
      "better-auth client not set. Call Accounts.setBetterAuthClient(client) first."
    );
  }

  return authClientInstance;
};

Accounts.syncBetterAuthSession = function syncBetterAuthSession(sessionToken) {
  const token =
    sessionToken !== undefined ? sessionToken : getCookie(DEFAULT_COOKIE_NAME);

  return new Promise((resolve, reject) => {
    Meteor.call("_betterAuth.syncSession", token || null, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
};

Accounts.refreshBetterAuthConnection = function refreshBetterAuthConnection() {
  const connection = Meteor.connection;

  return new Promise((resolve) => {
    connection.disconnect();

    const timeoutId = Meteor.setTimeout(() => {
      computation.stop();
      resolve();
    }, DEFAULT_RECONNECT_TIMEOUT_MS);

    const computation = Tracker.autorun(() => {
      if (!connection.status().connected) {
        return;
      }

      Meteor.clearTimeout(timeoutId);
      computation.stop();
      resolve();
    });

    connection.reconnect();
  });
};

Accounts.signInWithBetterAuth = async function signInWithBetterAuth(
  email,
  password
) {
  const client = Accounts.getBetterAuthClient();
  const data = unwrapBetterAuthError(
    await client.signIn.email({ email, password }),
    "Authentication failed"
  );

  await Accounts.syncBetterAuthSession(data?.token ?? null);
  return data;
};

Accounts.signUpWithBetterAuth = async function signUpWithBetterAuth(
  email,
  password,
  name
) {
  const client = Accounts.getBetterAuthClient();
  const data = unwrapBetterAuthError(
    await client.signUp.email({ email, password, name: name || "" }),
    "Unable to create account"
  );

  await Accounts.syncBetterAuthSession(data?.token ?? null);
  return data;
};

Accounts.signOutWithBetterAuth = async function signOutWithBetterAuth() {
  const client = Accounts.getBetterAuthClient();

  await client.signOut();
  await Accounts.syncBetterAuthSession(null);
};

Accounts.sendVerificationEmailWithBetterAuth =
  async function sendVerificationEmailWithBetterAuth(email) {
    const client = Accounts.getBetterAuthClient();

    return unwrapBetterAuthError(
      await client.sendVerificationEmail({ email }),
      "Unable to send verification email"
    );
  };

Accounts.requestPasswordResetWithBetterAuth =
  async function requestPasswordResetWithBetterAuth(email, redirectTo) {
    const client = Accounts.getBetterAuthClient();

    return unwrapBetterAuthError(
      await client.requestPasswordReset({ email, redirectTo }),
      "Unable to request password reset"
    );
  };

Accounts.resetPasswordWithBetterAuth = async function resetPasswordWithBetterAuth(
  token,
  newPassword
) {
  const client = Accounts.getBetterAuthClient();

  return unwrapBetterAuthError(
    await client.resetPassword({ token, newPassword }),
    "Unable to reset password"
  );
};

Accounts.changePasswordWithBetterAuth =
  async function changePasswordWithBetterAuth(
    currentPassword,
    newPassword,
    options = {}
  ) {
    const client = Accounts.getBetterAuthClient();
    const data = unwrapBetterAuthError(
      await client.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: options.revokeOtherSessions,
      }),
      "Unable to change password"
    );

    if (typeof data?.token === "string") {
      await Accounts.syncBetterAuthSession(data.token);
    } else {
      await Accounts.refreshBetterAuthConnection();
    }

    return data;
  };

Accounts.verifyEmailWithBetterAuth = async function verifyEmailWithBetterAuth(
  token
) {
  const response = await fetch(
    `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
    {
      credentials: "same-origin",
      method: "GET",
    }
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Meteor.Error(
      response.status,
      payload?.message || "Unable to verify email"
    );
  }

  await Accounts.refreshBetterAuthConnection();
  return payload;
};

export { Accounts };
