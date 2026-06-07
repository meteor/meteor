import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { Accounts } from "meteor/accounts-base";

const DEFAULT_COOKIE_NAME = "better-auth.session_token";

export function parseCookieHeader(cookieHeader) {
  const cookies = Object.create(null);

  if (!cookieHeader) {
    return cookies;
  }

  cookieHeader.split(";").forEach((pair) => {
    const eqIdx = pair.indexOf("=");

    if (eqIdx < 0) {
      return;
    }

    const key = pair.substring(0, eqIdx).trim();
    const value = pair.substring(eqIdx + 1).trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  });

  return cookies;
}

export async function resolveSignedToken(auth, signedToken, cookieName) {
  try {
    const headers = new Headers();

    headers.set("cookie", `${cookieName}=${signedToken}`);

    const session = await auth.api.getSession({ headers });

    return session?.user?.id || null;
  } catch (error) {
    return null;
  }
}

export async function resolvePlainToken(auth, plainToken) {
  try {
    const ctx = await auth.$context;
    const session = await ctx.adapter.findOne({
      model: "session",
      where: [{ field: "token", value: plainToken }],
    });

    if (
      session?.userId &&
      session.expiresAt &&
      new Date(session.expiresAt) > new Date()
    ) {
      return session.userId;
    }
  } catch (error) {
    return null;
  }

  return null;
}

export async function resolveConnectionUserId({
  auth,
  cookies,
  cookieHeader,
  cookieName = DEFAULT_COOKIE_NAME,
}) {
  const resolvedCookies = cookies || parseCookieHeader(cookieHeader);
  const signedToken = resolvedCookies[cookieName];

  if (!signedToken) {
    return null;
  }

  return resolveSignedToken(auth, signedToken, cookieName);
}

export async function syncConnectionAuthState({
  auth,
  sessionToken,
  invocation,
}) {
  if (!invocation) {
    return null;
  }

  if (!sessionToken) {
    if (invocation.userId) {
      await invocation.setUserId(null);
    }

    return null;
  }

  const userId = await resolvePlainToken(auth, sessionToken);

  if (userId) {
    if (invocation.userId !== userId) {
      await invocation.setUserId(userId);
    }

    return { userId };
  }

  if (invocation.userId) {
    await invocation.setUserId(null);
  }

  return null;
}

async function attachConnectionUserId(connection, userId) {
  const session = Meteor.server.sessions.get(connection.id);

  if (session) {
    await session._setUserId(userId);
  }
}

export function configureDDPBridge(
  auth,
  { cookieName = DEFAULT_COOKIE_NAME } = {}
) {
  if (typeof Accounts.registerSessionResolver === "function") {
    Accounts.registerSessionResolver((connection) =>
      resolveConnectionUserId({
        auth,
        cookies: connection.cookies,
        cookieHeader: connection.httpHeaders?.cookie || "",
        cookieName,
      })
    );
  } else {
    Meteor.onConnection(async (connection) => {
      const userId = await resolveConnectionUserId({
        auth,
        cookieHeader: connection.httpHeaders?.cookie || "",
        cookieName,
      });

      if (!userId) {
        return;
      }

      try {
        // Compatibility fallback for Meteor versions without
        // Accounts.registerSessionResolver.
        await attachConnectionUserId(connection, userId);
      } catch (error) {
        Meteor._debug(
          "[meteor-accounts-better-auth] Error setting userId on connection:",
          error
        );
      }
    });
  }

  Meteor.methods({
    async "_betterAuth.syncSession"(sessionToken) {
      check(sessionToken, Match.OneOf(String, null, undefined));

      return syncConnectionAuthState({
        auth,
        invocation: this,
        sessionToken,
      });
    },
  });
}
