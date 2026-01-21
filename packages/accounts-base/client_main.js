import {
  AccountsClient,
  AccountsTest,
} from "./accounts_client.js";
import { fetchWithAuth } from "./accounts_client_auth.js";

/**
 * @namespace Accounts
 * @summary The namespace for all client-side accounts-related methods.
 */
Accounts = new AccountsClient(Meteor.settings?.public?.packages?.accounts || {});

/**
 * @summary A [Mongo.Collection](#collections) containing user documents.
 * @locus Anywhere
 * @type {Mongo.Collection}
 * @importFromPackage meteor
 */
Meteor.users = Accounts.users;

/**
 * @summary A function that adds an auth token to a fetch request.
 * @locus Anywhere
 * @type {Function}
 * @importFromPackage meteor
 */
Meteor.fetchWithAuth = fetchWithAuth;

export {
  Accounts,
  AccountsClient,
  AccountsTest,
  fetchWithAuth,
  // For backwards compatibility. Note that exporting an object as the
  // default export is *not* the same as exporting its properties as named
  // exports, as was previously assumed.
  exports as default,
};
