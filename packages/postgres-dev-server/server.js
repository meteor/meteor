if (process.env.POSTGRES_URL === 'no-postgres-server') {
  Meteor._debug('Note: Restart Meteor to start the PostgreSQL server.');
}
