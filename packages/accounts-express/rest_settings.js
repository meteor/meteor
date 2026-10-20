import { Accounts } from "meteor/accounts-base";
import { check, Match } from "meteor/check";
import { WebApp } from "meteor/webapp";
import { createLoginMiddleware } from "./rest_login.js";
import { createLogoutMiddleware } from "./rest_logout.js";

function validatePath(path, name) {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\\s]/.test(path)) {
    throw new TypeError(`accounts-express rest.${name} must be a path without a query or fragment`);
  }
}

// Settings only control automatic registration. The middleware factories keep
// their own options so applications can still manage routes and ordering.
export function createConfiguredRestMiddleware(options) {
  if (options === undefined) return null;

  check(options, {
    enabled: Match.Optional(Boolean),
    loginPath: Match.Optional(String),
    logoutPath: Match.Optional(String),
  });

  const { enabled = false, loginPath = "/login", logoutPath = "/logout" } = options;
  validatePath(loginPath, "loginPath");
  validatePath(logoutPath, "logoutPath");
  if (loginPath === logoutPath) {
    throw new TypeError("accounts-express REST loginPath and logoutPath must be different");
  }
  if (!enabled) return null;

  if (typeof Accounts._checkPasswordLogin !== "function") {
    throw new Error(
      "accounts-express REST login requires accounts-password; run meteor add accounts-password",
    );
  }

  const router = WebApp.express.Router();
  const parseJson = WebApp.express.json();
  router.use((req, res, next) => {
    if (req.method === "POST" && (req.url || "").split("?")[0] === loginPath) {
      return parseJson(req, res, next);
    }
    return next();
  });
  router.use(createLoginMiddleware({ path: loginPath }));
  router.use(createLogoutMiddleware({ path: logoutPath }));
  return router;
}
