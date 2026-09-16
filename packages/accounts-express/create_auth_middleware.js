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

export function createWebAppAuthMiddleware({ hashLoginTokenFn, required = false }) {
  return async function meteorWebAppAuthMiddleware(req, res, next) {
    const continueUnauthenticated = () => {
      req.userId = null;
      return _CurrentEndpointInvocation.withValue({ userId: null, loginToken: null }, () => next());
    };

    try {
      const authHeader = req.headers.authorization;
      const cookies = req.headers.cookie;
      let token;

      // Try to get token from Authorization header
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.replace("Bearer ", "");
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
        if (!required) return continueUnauthenticated();
        return res.status(401).json({ error: "Invalid token" });
      }

      const tokenData = user.services.resume.loginTokens.find((t) => t.hashedToken === hashedToken);
      if (!tokenData) {
        if (!required) return continueUnauthenticated();
        return res.status(401).json({ error: "Invalid token" });
      }

      const tokenAge = Date.now() - tokenData.when.getTime();
      if (tokenAge > Accounts._getTokenLifetimeMs()) {
        if (!required) return continueUnauthenticated();
        return res.status(401).json({ error: "Token expired" });
      }

      req.userId = user._id;

      return _CurrentEndpointInvocation.withValue({ userId: user._id, loginToken: token }, () =>
        next(),
      );
    } catch (err) {
      return next(err);
    }
  };
}
