if (process.env.MONGO_URL === 'no-mongo-server') {
  Meteor._debug('Note: Restart Meteor to start the MongoDB server.');
}
