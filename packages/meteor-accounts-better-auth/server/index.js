import { Accounts } from "meteor/accounts-base";
import { configureDDPBridge } from "./ddp-bridge";
import { mountBetterAuthHandler } from "./handler";

const DEFAULT_BASE_PATH = "/api/auth";
const DEFAULT_COOKIE_NAME = "better-auth.session_token";
const DEFAULT_PUBLISH_FIELDS = {
  email: 1,
  emailVerified: 1,
  emails: 1,
  image: 1,
  name: 1,
  profile: 1,
  username: 1,
};

let authInstance = null;

function configureUserPublishing() {
  if (typeof Accounts.setDefaultPublishFields === "function") {
    Accounts.setDefaultPublishFields(DEFAULT_PUBLISH_FIELDS);
  }

  if (typeof Accounts.addAutopublishFields === "function") {
    Accounts.addAutopublishFields({
      forLoggedInUser: ["email", "emailVerified", "name", "image"],
      forOtherUsers: ["name", "image"],
    });
  }
}

Accounts.configureBetterAuth = function configureBetterAuth(options = {}) {
  if (authInstance) {
    throw new Error("Accounts.configureBetterAuth() can only be called once");
  }

  if (!options.auth) {
    throw new Error(
      "Accounts.configureBetterAuth() requires an `auth` option created in the app."
    );
  }

  authInstance = options.auth;

  mountBetterAuthHandler(
    authInstance,
    options.basePath || DEFAULT_BASE_PATH,
    options.toNodeHandler
  );
  configureDDPBridge(authInstance, {
    cookieName: options.cookieName || DEFAULT_COOKIE_NAME,
  });
  configureUserPublishing();

  return authInstance;
};

Accounts.getBetterAuth = function getBetterAuth() {
  if (!authInstance) {
    throw new Error(
      "better-auth is not configured. Call Accounts.configureBetterAuth({ auth }) first."
    );
  }

  return authInstance;
};

export { Accounts };
