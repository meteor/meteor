// singleton
export const LocalCollectionDriver = new (class LocalCollectionDriver {
  constructor() {
    this.noConnCollections = Object.create(null);
  }

  open(name, conn) {
    if (! name) {
      return new LocalCollection;
    }

    if (! conn) {
      return ensureCollection(name, this.noConnCollections);
    }

    if (! conn._mongo_livedata_collections) {
      conn._mongo_livedata_collections = Object.create(null);
    }

    // XXX is there a way to keep track of a connection's collections without
    // dangling it off the connection object?
    return ensureCollection(name, conn._mongo_livedata_collections);
  }
});

function ensureCollection(name, collections) {
  return (name in collections)
    ? collections[name]
    : collections[name] = new LocalCollection(name);
}
