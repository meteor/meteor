import { Meteor } from 'meteor/meteor';
import { Accounts, _CurrentEndpointInvocation } from 'meteor/accounts-base';

export function createWebAppAuthMiddleware({ hashLoginTokenFn, required = false }) {
  return async function meteorWebAppAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const cookies = req.headers.cookie;
    let token;

    // Try to get token from Authorization header
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    } else if (cookies) {
      // Try to get token from cookies
      const cookieMap = cookies.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});

      if (cookieMap['meteor_login_token']) {
        token = cookieMap['meteor_login_token'];
      }
    }

    // If no token and authentication is optional, continue without authentication
    if (!token) {
      if (!required) {
        return _CurrentEndpointInvocation.withValue({ userId: null, loginToken: null }, () => {
          next();
        });
      }
      return res.status(401).json({ error: "Unauthorized" });
    }

    const hashedToken = hashLoginTokenFn(token);

    const user = await Meteor.users.findOneAsync({
      "services.resume.loginTokens.hashedToken": hashedToken,
    });
    if (!user) {
      if (!required) {
        return _CurrentEndpointInvocation.withValue({ userId: null, loginToken: null }, () => {
          next();
        });
      }
      return res.status(401).json({ error: "Invalid token" });
    }

    const tokenData = user.services.resume.loginTokens.find(
      (t) => t.hashedToken === hashedToken
    );
    if (!tokenData) {
      if (!required) {
        return _CurrentEndpointInvocation.withValue({ userId: null, loginToken: null }, () => {
          next();
        });
      }
      return res.status(401).json({ error: "Invalid token" });
    }

    const tokenAge = Date.now() - tokenData.when.getTime();
    if (tokenAge > Accounts._getTokenLifetimeMs()) {
      if (!required) {
        return _CurrentEndpointInvocation.withValue({ userId: null, loginToken: null }, () => {
          next();
        });
      }
      return res.status(401).json({ error: "Token expired" });
    }

    req.userId = user._id;

    _CurrentEndpointInvocation.withValue({ userId: user._id, loginToken: token }, () => {
      next();
    });
  };
}
