/**
 * Client entry point for the postgres package.
 *
 * On the client, Postgres.Collection uses AFS.Collection which
 * delegates to Minimongo + DDP. No schema needed client-side.
 */

const { AFS } = Package.afs;

Postgres = {
  Collection: class PostgresCollection extends AFS.Collection {
    constructor(name, options = {}) {
      // Client-side: strip schema (not needed, client uses Minimongo + DDP)
      const clientOptions = { ...options };
      delete clientOptions.schema;
      delete clientOptions.provider;
      super(name, clientOptions);
    }
  },
};
