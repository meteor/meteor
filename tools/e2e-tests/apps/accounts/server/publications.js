import { Meteor } from 'meteor/meteor';

Meteor.publish('_e2e.me', function () {
  if (!this.userId) {
    return this.ready();
  }
  return Meteor.users.find(
    { _id: this.userId },
    { fields: { username: 1, emails: 1, profile: 1, 'services.twoFactorAuthentication.type': 1 } },
  );
});
