import { Meteor } from 'meteor/meteor';
import { getWebAuthnConfig } from './config.js';
import { setupChallengesCollection } from './collection.js';
import { setupUsersIndexes } from './credential_store.js';
import './hooks.js';
import './methods.js';
import './login_handler.js';
import './signup.js';
import './second_factor.js';

Meteor.startup(async () => {
  // Surface configuration mistakes at startup rather than on first use.
  getWebAuthnConfig();
  await setupChallengesCollection();
  await setupUsersIndexes();
});
