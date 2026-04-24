/**
 * Client entry point for the postgres package.
 *
 * On the client, Postgres.Collection uses AFS.Collection which
 * delegates to Minimongo + DDP. No schema needed client-side.
 */

const { AFS } = Package.afs;

// Module-level latch: fire the provider-on-client warning once per page load.
let _warnedProviderOnClient = false;

Postgres = {
  Collection: class PostgresCollection extends AFS.Collection {
    constructor(name, options = {}) {
      // Client-side: strip schema (not needed, client uses Minimongo + DDP)
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
