import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';

import { SentEmails, clearSentEmails, lastEmailTo } from '../fake-mailer.js';

Meteor.methods({
  async '_e2e.lastEmail'({ to }) {
    check(to, String);
    return lastEmailTo(to);
  },

  async '_e2e.allEmails'({ to }) {
    check(to, Match.Optional(String));
    const sel = to ? { to } : {};
    return SentEmails.find(sel, { sort: { at: -1 } }).fetchAsync();
  },

  async '_e2e.clearEmails'() {
    await clearSentEmails();
    return true;
  },

  async '_e2e.sendResetPasswordEmail'({ email }) {
    check(email, String);
    const user = await Meteor.users.findOneAsync({ 'emails.address': email });
    if (!user) throw new Meteor.Error('no-user', 'No user with that email');
    return Accounts.sendResetPasswordEmail(user._id, email);
  },

  async '_e2e.sendEnrollmentEmail'({ userId, email }) {
    check(userId, String);
    check(email, Match.Optional(String));
    return Accounts.sendEnrollmentEmail(userId, email);
  },

  async '_e2e.sendVerificationEmail'({ userId, email }) {
    check(userId, String);
    check(email, Match.Optional(String));
    return Accounts.sendVerificationEmail(userId, email);
  },
});
