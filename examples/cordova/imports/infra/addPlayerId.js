import {Meteor} from 'meteor/meteor';

Meteor.methods({
  addPlayerId({playerId}) {
    this.unblock();
    if (Meteor.isClient || !this.userId || !playerId) return null;

    Meteor.users.update(this.userId, {$addToSet: {playersIds: playerId}});
  },
});
