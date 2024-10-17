Package.describe({
  summary: "A user account system",
  version: "3.0.3",
});

Package.onUse((api) => {
  api.use("ecmascript", ["client", "server"]);
  api.use("ddp-rate-limiter");
  api.use("localstorage", "client");
  api.use("tracker", "client");
  api.use("check", "server");
  api.use("random", ["client", "server"]);
  api.use("ejson", "server");
  api.use("callback-hook", ["client", "server"]);
  api.use("reactive-var", "client");
  api.use("url", ["client", "server"]);

  // needed for getting the currently logged-in user and handling reconnects
  api.use("ddp", ["client", "server"]);

  // need this because of the Meteor.users collection but in the future
  // we'd probably want to abstract this away
  api.use("mongo", ["client", "server"]);

  // If the 'blaze' package is loaded, we'll define some helpers like
  // {{currentUser}}.  If not, no biggie.
  api.use("blaze", "client", { weak: true });

  // Allow us to detect 'autopublish', and publish some Meteor.users fields if
  // it's loaded.
  api.use("autopublish", "server", { weak: true });

  api.use("oauth-encryption", "server", { weak: true });

  // Though this "Accounts" symbol is the only official Package export for
  // the accounts-base package, modules that import accounts-base will
  // have access to anything added to the exports object of the main
  // module, including AccountsClient and AccountsServer (those symbols
  // just won't be automatically imported as "global" variables).
  api.export("Accounts");

  // These main modules import all the other modules that comprise the
  // accounts-base package, and define exports that will be accessible to
  // modules that import the accounts-base package.
  api.mainModule("server_main.js", "server");
  api.mainModule("client_main.js", "client");

  api.addAssets("accounts-base.d.ts", "server");
});

Package.onTest((api) => {
  api.use([
    "accounts-base",
    "ecmascript",
    "tinytest",
    "random",
    "test-helpers",
    "oauth-encryption",
    "ddp",
    "accounts-password",
    "accounts-2fa",
  ]);

  api.addFiles("accounts_tests_setup.js", "server");
  api.mainModule("server_tests.js", "server");
  api.mainModule("client_tests.js", "client");
});
