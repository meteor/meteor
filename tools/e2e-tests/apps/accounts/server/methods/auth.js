import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';

import { primeFakeOAuthCredential } from '../fake-oauth-service.js';

Meteor.methods({
  async '_e2e.simulateOAuthLogin'({ identity, email, profile }) {
    check(identity, String);
    check(email, Match.Optional(String));
    check(profile, Match.Optional(Object));
    return primeFakeOAuthCredential({ identity, email, profile });
  },

  async '_e2e.generateTotp'(secret) {
    check(secret, String);
    return Accounts._generate2faToken(secret).token;
  },

  async '_e2e.requestLoginToken'({ email }) {
    check(email, String);
    return Meteor.callAsync('requestLoginTokenForUser', {
      selector: { email },
      userData: { email },
    });
  },
});
