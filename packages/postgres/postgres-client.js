import { AFS } from 'meteor/afs';

let _warnedProviderOnClient = false;

Postgres = {
  Collection: class PostgresCollection extends AFS.Collection {
    constructor(name, options = {}) {
      const clientOptions = { ...options };
      delete clientOptions.schema;
      if (clientOptions.provider !== undefined) {
        if (!_warnedProviderOnClient) {
          _warnedProviderOnClient = true;
          Meteor._debug(
            'Postgres.Collection: "provider" option is server-only and is ignored on the client.'
          );
        }
        delete clientOptions.provider;
      }
      super(name, clientOptions);
    }
  },
};
