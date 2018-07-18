import { AccountsClient, AccountsTest } from "./accounts_client.js";

/**
 * @namespace Accounts
 * @summary The namespace for all client-side accounts-related methods.
 */
Accounts = new AccountsClient();

/**
 * @summary A [Mongo.Collection](#collections) containing user documents.
 * @locus Anywhere
 * @type {Mongo.Collection}
 * @importFromPackage meteor
 */
Meteor.users = Accounts.users;

const exp = { AccountsClient };

if (Meteor.isPackageTest) {
  // Since this file is the main module for the client version of the
  // accounts-base package, properties of non-entry-point modules need to
  // be re-exported in order to be accessible to modules that import the
  // accounts-base package.
  exp.AccountsTest = AccountsTest;
}

export default exp;
