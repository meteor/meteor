import {
  AccountsClient,
  AccountsTest,
} from "./accounts_client.js";

/**
 * @namespace Accounts
 * @global
 * @summary The namespace for all client-side accounts-related methods.
 */
Accounts = new AccountsClient();
const Accounts = Accounts

/**
 * @summary A [Mongo.Collection](#collections) containing user documents.
 * @locus Anywhere
 * @type {Mongo.Collection}
 * @importFromPackage meteor
 */
Meteor.users = Accounts.users;

export {
  Accounts,
  AccountsClient,
  AccountsTest,
  // For backwards compatibility. Note that exporting an object as the
  // default export is *not* the same as exporting its properties as named
  // exports, as was previously assumed.
  Accounts as default,
};
