import { Meteor } from "meteor/meteor";
import { Accounts, _CurrentEndpointInvocation } from "meteor/accounts-base";

function parseCookies(header) {
  return header.split(";").reduce((acc, pair) => {
    const trimmed = pair.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return acc;
    const key = trimmed.slice(0, eqIdx);
    const raw = trimmed.slice(eqIdx + 1);
    try {
      acc[key] = decodeURIComponent(raw);
    } catch {
      acc[key] = raw;
    }
    return acc;
  }, {});
}

export function createWebAppAuthMiddleware({
  hashLoginTokenFn,
  required = false,
  apiTokens = false,
}) {
  if (
    apiTokens !== false &&
    apiTokens !== true &&
    (!apiTokens ||
      typeof apiTokens !== "object" ||
      !Array.isArray(apiTokens.scopes) ||
      apiTokens.scopes.length === 0 ||
      apiTokens.scopes.some((scope) => typeof scope !== "string" || !scope.trim()))
  ) {
    throw new TypeError("apiTokens must be a boolean or an object with a nonempty scopes array");
  }
  const requiredScopes = typeof apiTokens === "object" ? [...apiTokens.scopes] : null;

  return async function meteorWebAppAuthMiddleware(req, res, next) {
    const continueUnauthenticated = () => {
      req.userId = null;
      req.auth = null;
      return _CurrentEndpointInvocation.withValue(
        { userId: null, loginToken: null, auth: null },
        () => next(),
      );
    };
    const continueAuthenticated = (userId, token, auth) => {
      req.userId = userId;
      req.auth = auth;
      return _CurrentEndpointInvocation.withValue({ userId, loginToken: token, auth }, () =>
        next(),
      );
    };

    try {
      const authHeader = req.headers.authorization;
      const cookies = req.headers.cookie;
      const hasBearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ");
      let token;

      // Try to get token from Authorization header
      if (hasBearerToken) {
        token = authHeader.slice("Bearer ".length);
      } else if (cookies) {
        const cookieMap = parseCookies(cookies);
        if (cookieMap["meteor_login_token"]) {
          token = cookieMap["meteor_login_token"];
        }
      }

      if (!token) {
        if (!required) return continueUnauthenticated();
        return res.status(401).json({ error: "Unauthorized" });
      }

      const hashedToken = hashLoginTokenFn(token);

      const user = await Meteor.users.findOneAsync({
        "services.resume.loginTokens.hashedToken": hashedToken,
      });
      if (!user) {
        // API tokens are a separate credential type. Cookie authentication and
        // routes which have not opted in continue to accept sessions only.
        if (hasBearerToken && apiTokens) {
          const apiToken = await Accounts._findApiToken(token);
          if (apiToken) {
            if (
              apiToken.scopes !== null &&
              (!requiredScopes || !requiredScopes.every((scope) => apiToken.scopes.includes(scope)))
            ) {
              // A valid but insufficient credential must not fall through to an
              // anonymous handler, including when authentication is optional.
              return res.status(403).json({ error: "Insufficient token scope" });
            }
            return continueAuthenticated(apiToken.userId, token, {
              type: "apiToken",
              tokenId: apiToken.id,
              scopes: apiToken.scopes,
            });
          }
        }
        if (!required) return continueUnauthenticated();
        return res.status(401).json({ error: "Invalid token" });
      }

      const tokenData = user.services.resume.loginTokens.find((t) => t.hashedToken === hashedToken);
      if (!tokenData) {
        if (!required) return continueUnauthenticated();
        return res.status(401).json({ error: "Invalid token" });
      }

      const when = tokenData.when;
      const tokenExpires =
        when instanceof Date || typeof when === "number" ? Accounts._tokenExpiration(when) : null;
      if (
        !tokenExpires ||
        !Number.isFinite(tokenExpires.getTime()) ||
        Date.now() >= tokenExpires.getTime()
      ) {
        if (!required) return continueUnauthenticated();
        return res.status(401).json({ error: "Token expired" });
      }

      return continueAuthenticated(user._id, token, { type: "session" });
    } catch (err) {
      return next(err);
    }
  };
}
