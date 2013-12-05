Parameters for simulation:

- numCollections
    how many collections to spread the documents over

- maxAgeSeconds: How long to leave documents in the database. This,
    combined with all the various rates, determines the steady state
    database size. In seconds. falsy to disable.

Per-client action rates:
- insertsPerSecond
- updatesPerSecond
- removesPerSecond

- documentSize: bytes of randomness per document.
    // XXX make this a random distribution?
- documentNumFields: how many fields of randomness per document.
