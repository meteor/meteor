import { AccountsServer } from "./accounts_server.js";

/**
 * @namespace Accounts
 * @summary The namespace for all server-side accounts-related methods.
 */
Accounts = new AccountsServer(Meteor.server, { ...Meteor.settings.packages?.accounts, ...Meteor.settings.packages?.['accounts-base'] });
// TODO[FIBERS]: I need TLA
Accounts.init().then();

/**
 * @summary Find a user by one of their email addresses.
 * @locus Server
 * @param {String} email The email address to look for
 * @param {Object} [options]
 * @param {Object} options.fields Limit the fields to return from the user document
 * @returns {Promise<Object>} A user if found, else null
 * @memberof Accounts
 * @importFromPackage accounts-base
 */
Accounts.findUserByEmail = AccountsServer.findUserByEmail;

/**
 * @summary Find a user by their username.
 * @locus Server
 * @param {String} username The username to look for
 * @param {Object} [options]
 * @param {Object} options.fields Limit the fields to return from the user document
 * @returns {Promise<Object>} A user if found, else null
 * @memberof Accounts
 * @importFromPackage accounts-base
 */
Accounts.findUserByUsername = Accounts.findUserByUsername;
// Users table. Don't use the normal autopublish, since we want to hide
// some fields. Code to autopublish this is in accounts_server.js.
// XXX Allow users to configure this collection name.

/**
 * @summary A [Mongo.Collection](#collections) containing user documents.
 * @locus Anywhere
 * @type {Mongo.Collection}
 * @importFromPackage meteor
 */
Meteor.users = Accounts.users;

export {
  // Since this file is the main module for the server version of the
  // accounts-base package, properties of non-entry-point modules need to
  // be re-exported in order to be accessible to modules that import the
  // accounts-base package.
  AccountsServer
};
