# AFS — Adaptive Federated Streams

AFS is a data-source-agnostic reactivity layer for Meteor. It lets you swap
MongoDB for PostgreSQL, Redis, SQLite, or anything else while keeping the
same collection API your app already uses.

The elevator pitch: `Mongo.Collection` is great, but it's married to MongoDB.
AFS gives you `Postgres.Collection`, `Redis.Collection`, or
`YourThing.Collection` — all with the same `find`, `insert`, `update`,
`remove`, `observe`, and publish/subscribe semantics Meteor developers already
know.

## Why

Meteor's reactive data model is genuinely good. The tight loop between
database changes, server publications, and client-side Minimongo makes
building real-time apps feel effortless. But that model has always been
locked to MongoDB.

AFS keeps everything that makes Meteor's data layer great and removes the
lock-in. Your app code doesn't change. Your publications don't change. Your
client-side queries don't change. Only the storage backend changes.

## How it works

```
  Client (Minimongo + DDP)          Server
  ┌──────────────────────┐          ┌──────────────────────────────┐
  │                      │          │  AFS.Collection('todos')     │
  │  Todos.find()        │◄── DDP ──┤         │                    │
  │  Todos.insert(...)   ├── DDP ──►│    StreamProvider             │
  │                      │          │     ├── PostgresProvider      │
  └──────────────────────┘          │     ├── MongoProvider         │
                                    │     ├── RedisProvider         │
                                    │     └── ...                   │
                                    └──────────────────────────────┘
```

On the client, nothing changes. Collections use Minimongo and DDP, same as
always. On the server, `AFS.Collection` delegates to a **StreamProvider** —
an adapter that talks to the actual database. The provider handles queries,
writes, and change observation. AFS handles everything else: DDP
integration, allow/deny, autopublish, cursor semantics.

## Quick start (PostgreSQL)

```bash
meteor add postgres postgres-dev-server
```

That's it. Meteor downloads a PostgreSQL binary, starts it on the next
available port, and sets `POSTGRES_URL` automatically. Same zero-config
experience as MongoDB.

```js
// imports/api/todos.js
export const Todos = new Postgres.Collection('todos', {
  schema: {
    title:      { type: 'text', required: true },
    completed:  { type: 'boolean', default: false },
    created_at: { type: 'timestamp', default: 'now' },
  },
});
```

```js
// server/main.js
import { Todos } from '/imports/api/todos';

Meteor.publish('todos', function () {
  return Todos.find({}, { sort: { created_at: -1 } });
});

Meteor.methods({
  async 'todos.add'(title) {
    return Todos.insertAsync({ title, completed: false });
  },
  async 'todos.toggle'(id) {
    const todo = await Todos.findOneAsync(id);
    return Todos.updateAsync(id, { $set: { completed: !todo.completed } });
  },
});
```

```js
// client
const todos = Todos.find({ completed: false }).fetch();
await Meteor.callAsync('todos.add', 'Buy milk');
```

If you've written a Meteor app before, this should look completely
familiar. The only difference is `Postgres.Collection` instead of
`Mongo.Collection`, plus a `schema` option that tells PostgreSQL how
to lay out the table.

## The collection API

`AFS.Collection` exposes the same interface as `Mongo.Collection`:

```js
const Items = new AFS.Collection('items', { provider: myProvider });

// Queries
Items.find(selector, options)         // Returns cursor
Items.findOneAsync(selector)          // Returns document or undefined

// Mutations
await Items.insertAsync(doc)          // Returns _id
await Items.updateAsync(selector, modifier, options)
await Items.removeAsync(selector)
await Items.upsertAsync(selector, modifier)

// Indexes
await Items.createIndexAsync({ field: 1 })
await Items.dropIndexAsync('index_name')

// Raw escape hatch (server-only; throws on client or without a provider)
Items.rawDatabase()                   // e.g. pg Pool, Redis client
Items.rawCollection()                 // e.g. table name, collection handle
```

### Cursors

Cursors work exactly like Mongo cursors:

```js
const cursor = Items.find({ status: 'active' }, {
  sort: { created_at: -1 },
  limit: 20,
  skip: 0,
  projection: { title: 1, status: 1 },
});

cursor.fetch()                        // Array of documents
cursor.count()                        // Number of matches
cursor.forEach(doc => { ... })
cursor.map(doc => doc.title)

// Reactive observation
const handle = cursor.observeChanges({
  added(id, fields) { },
  changed(id, fields) { },
  removed(id) { },
});
handle.stop();
```

### Publications

Standard Meteor publications just work:

```js
Meteor.publish('activeItems', function () {
  return Items.find({ status: 'active' });
});
```

The cursor's `observeChanges` drives the publication. When the underlying
database changes, the provider fires callbacks, and DDP pushes updates to
connected clients.

## Writing a StreamProvider

A StreamProvider is an adapter between AFS and a database. Here's what
the interface looks like and what you need to implement.

### Required methods

```js
import { AFS } from 'meteor/afs';

class MyProvider extends AFS.StreamProvider {
  constructor(connectionUrl) {
    super({ name: 'my-database' });
    this._url = connectionUrl;
  }

  // Connect to the database
  async connect() {
    this._client = await createConnection(this._url);
    this._connected = true;
  }

  // Disconnect
  async close() {
    await this._client.close();
    this._connected = false;
  }

  // Insert a document. Return its _id.
  async insertAsync(collectionName, doc) {
    if (!doc._id) doc._id = this.generateId(collectionName);
    await this._client.insert(collectionName, doc);
    return doc._id;
  }

  // Update documents matching selector. Return number affected.
  async updateAsync(collectionName, selector, modifier, options) {
    // Translate MongoDB-style $set/$unset/etc. to your database's format
    return this._client.update(collectionName, selector, modifier);
  }

  // Remove documents matching selector. Return number removed.
  async removeAsync(collectionName, selector) {
    return this._client.remove(collectionName, selector);
  }

  // Return a cursor for querying.
  find(collectionName, selector, options) {
    return new AFS.Cursor(this, collectionName, selector, options);
  }

  // Core reactive primitive. Set up change observation and return a handle.
  async observeChanges(cursorDescription, ordered, callbacks) {
    // Listen for changes from your database (change streams, polling,
    // LISTEN/NOTIFY, pub/sub, whatever) and call:
    //   callbacks.added(id, fields)
    //   callbacks.changed(id, fields)
    //   callbacks.removed(id)
    //
    // Return { stop() } to clean up.
  }
}
```

That's the core contract. AFS calls these methods; you translate them
into whatever your database understands.

### Optional: EventEmitter path (`startObserving`)

Providers that have a natural push channel (LISTEN/NOTIFY, Redis pub/sub,
Kafka, change streams) can implement `startObserving` instead of (or in
addition to) `observeChanges`. afs handles fan-out and refcounting via
its `ObserveMultiplexer`; you just emit changes into a `ChangeStream`.

```js
import { AFS } from 'meteor/afs';

class MyProvider extends AFS.StreamProvider {
  supportsEventEmitter() { return true; }

  startObserving(cursorDescription, ordered) {
    const stream = new AFS.ChangeStream(cursorDescription);

    // Defer initial emission to the next microtask so afs has time to
    // attach listeners (sync emission would silently drop early events).
    Promise.resolve().then(async () => {
      const initial = await this._fetchInitial(cursorDescription);
      for (const doc of initial) stream.added(doc._id, doc);
      stream.markReady();
    });

    // Set up your push channel — the bits that need cleaning up later.
    const timer = setInterval(() => this._poll(stream, cursorDescription), 1000);
    const onNotify = (msg) => stream.changed(msg.id, msg.fields);
    this._bus.on('change', onNotify);

    // Bundle the stream with a teardown closure. afs invokes teardown
    // exactly once when the subscription's last consumer detaches OR
    // when the provider closes. afs always calls `stream.stop()` after
    // teardown returns — don't call it yourself.
    return {
      stream,
      teardown: () => {
        clearInterval(timer);
        this._bus.removeListener('change', onNotify);
      },
    };
  }
}
```

A provider may also return a bare `ChangeStream` (no teardown) if it has
no per-subscription resources to release — `MockStreamProvider` and
`MongoStreamProvider` both do. afs detects which form was returned via
`instanceof ChangeStream`.

afs's contract:

- **Teardown ordering:** runs *before* `stream.stop()` on the normal
  eviction (last-consumer-detach) and construction-failure paths. On
  the provider-close and provider-self-stop paths a safety-net listener
  fires teardown during stream stop.
- **At-most-once:** afs guarantees teardown is invoked at most once per
  `startObserving` return. You don't need to write your own guard.
- **Errors:** A throw from teardown is caught and logged via
  `Meteor._debug`; `stream.stop()` still runs. One bad teardown can't
  strand a stream.
- **Garbage returns:** Anything other than `ChangeStream` or
  `{ stream: ChangeStream, teardown: Function }` raises a `TypeError`
  naming your provider class. Fail-fast.
- **No sync emission:** Don't call `stream.added`/`changed`/`markReady`
  synchronously inside `startObserving` — defer to the next microtask.
  afs needs the call to return so it can attach listeners; sync emission
  silently drops events. afs warns via `Meteor._debug` if the stream is
  already ready when `startObserving` returns.

### Fetching query results

AFS cursors call `provider.fetchResults()` internally. Implement this to
run the actual query:

```js
async fetchResults(collectionName, selector, options) {
  // Run your query, return an array of plain JS objects.
  // Each object must have an _id field.
  const rows = await this._client.query(collectionName, selector, options);
  return rows;
}
```

### Optional methods

These have sensible defaults but you can override them:

```js
// Custom ID generation (default: Random.id())
generateId(collectionName) {
  return uuid.v4();
}

// Index management
async createIndexAsync(collectionName, index, options) { }
async dropIndexAsync(collectionName, indexName) { }

// Raw access for advanced use cases
rawDatabase() { return this._client; }
rawCollection(collectionName) { return this._client.table(collectionName); }
```

### Capabilities

Providers declare what they support. This lets AFS (and your app)
make smart decisions:

```js
capabilities() {
  return {
    reactiveQueries: true,    // Can push changes as they happen
    transactions: true,       // ACID transactions
    changeStreams: false,      // Native change stream support
    oplog: false,             // Operation log tailing
    fullTextSearch: true,     // Full-text search
    geoQueries: false,        // Geospatial queries
    aggregation: true,        // Aggregation pipelines
    joins: true,              // Table/collection joins
    upsert: true,             // Upsert operations
  };
}
```

### Registering a provider

```js
const provider = new MyProvider('my-database://localhost/mydb');
await provider.connect();
AFS.registerProvider('my-database', provider);
```

The first provider registered becomes the default. Collections can
specify a provider explicitly or use the default:

```js
// Explicit
const Items = new AFS.Collection('items', { provider: myPostgres });

// Default provider
const Items = new AFS.Collection('items');
```

## Writing an adapter: the AST contract

Adapter authors translate Meteor's collection API to a backend store. afs
provides a normalized **AST** family — `SelectorAST`, `ModifierAST`,
`SortAST`, `ProjectionAST` — that adapters walk to compile to native query
syntax. Adapters that filter or modify in JS after fetch (polling adapters,
in-memory caches) use afs's `match` and `applyModifier` directly.

```js
import {
  parseSelector, parseModifier, parseSort, parseProjection,
  walkSelector, walkModifier,
  match, applyModifier,
  AST, PRED, MOD,
  UnsupportedOperatorError,
} from 'meteor/afs';
```

### Selector AST shape

```js
{ type: 'And',  clauses: SelectorAST[] }
{ type: 'Or',   clauses: SelectorAST[] }
{ type: 'Not',  clause:  SelectorAST }
{ type: 'Field', path: string[], predicate: { kind, ... } }
// predicate kinds: Eq, Ne, Gt, Gte, Lt, Lte, In, Nin, Exists, Type, Regex,
// Mod, Size, All, ElemMatch, Bits
```

Field paths are arrays (`['profile', 'name']`), never dotted strings.

### Walking the AST (worked example — Redis adapter sketch)

```js
const visitor = {
  __adapterName__: 'redis',
  And:   (node, ctx) => node.clauses.map((c) => walkSelector(c, visitor, ctx)).reduce(intersect),
  Or:    (node, ctx) => node.clauses.map((c) => walkSelector(c, visitor, ctx)).reduce(union),
  Field: (node, ctx) => {
    const key = `${ctx.collectionName}:${node.path[0]}:${node.predicate.value}`;
    return ctx.client.smembers(key);   // example: pre-built index
  },
};

const ast = parseSelector(rawSelector);
const ids = await walkSelector(ast, visitor, { collectionName, client });
```

Operators outside the adapter's capability set throw
`UnsupportedOperatorError` from `walkSelector`. Declare what the adapter
supports in `capabilities()`:

```js
class RedisStreamProvider extends StreamProvider {
  capabilities() {
    return {
      reactiveQueries: true,
      selectorOperators: ['Eq', 'In', 'And', 'Or'],
      modifierOperators: ['Set', 'Unset', 'Inc'],
    };
  }
}
```

`FederatedCollection` consults these and rejects with `NotSupported` *before*
dispatching, so an unsupported operator surfaces at the API call site rather
than mid-walk.

### When to use `match` / `applyModifier`

For adapters that filter or modify in JS (e.g., polling adapters that fetch
the whole collection then filter, or a snapshot diff after each poll):

```js
const ast = parseSelector(rawSelector);
const matches = docs.filter((doc) => match(doc, ast));
```

```js
const ast = parseModifier(rawModifier);
applyModifier(doc, ast);   // mutates in place
```

Both functions accept either raw shapes or pre-parsed ASTs. Pre-parse in the
adapter's hot path; the WeakMap-backed compiled-matcher cache keys on AST
instance identity.

### Reference adapter

`packages/postgres/sql_compiler.js` is the worked reference: visitor objects
that walk `SelectorAST` to emit parameterized `WHERE` clauses, walk
`ModifierAST` to emit `SET` clauses or fall through to fetch-modify-write.

## Adapter sketches

These aren't shipped implementations — they're outlines showing how different
databases would plug into the StreamProvider interface. The goal is to show
that the interface is general enough to handle fundamentally different
storage models.

### PostgreSQL (shipped)

The `postgres` package is the first non-Mongo provider. It compiles
MongoDB-style selectors (`{ age: { $gt: 21 } }`) into parameterized SQL
(`WHERE age > $1`), uses LISTEN/NOTIFY for reactive change detection, and
maps typed schemas to native PostgreSQL columns.

Key design decisions:
- Schema columns get native PG types (TEXT, INTEGER, BOOLEAN, etc.)
- Unschema'd fields overflow into a `_extra JSONB` column
- `$set`, `$unset`, `$inc`, `$push` translate to SQL `UPDATE` clauses
- Complex modifiers fall back to fetch-modify-write inside a transaction
- LISTEN/NOTIFY triggers on each table drive `observeChanges`

### SQLite (hypothetical)

A SQLite provider would look almost identical to PostgreSQL, minus the
network layer. Good candidate for mobile/embedded apps or Electron.

```js
class SQLiteProvider extends AFS.StreamProvider {
  constructor(filepath) {
    super({ name: 'sqlite' });
    this._filepath = filepath;
  }

  async connect() {
    this._db = new Database(this._filepath);
    this._connected = true;
  }

  // Same SQL compilation as Postgres, adjusted for SQLite dialect
  async insertAsync(collectionName, doc) { /* ... */ }

  // Reactive: poll-and-diff (SQLite has no built-in change notification)
  async observeChanges(cursorDescription, ordered, callbacks) {
    // Poll on interval, diff results, fire callbacks
  }

  capabilities() {
    return { transactions: true, joins: true, upsert: true };
  }
}
```

### Redis (hypothetical)

Redis doesn't have tables or SQL. Documents would be stored as hashes,
queried by key patterns, and reactivity would come from Redis pub/sub.

```js
class RedisProvider extends AFS.StreamProvider {
  constructor(url) {
    super({ name: 'redis' });
    this._url = url;
  }

  async insertAsync(collectionName, doc) {
    if (!doc._id) doc._id = this.generateId(collectionName);
    const key = `${collectionName}:${doc._id}`;
    await this._client.hSet(key, flatten(doc));
    await this._client.publish(`changes:${collectionName}`,
      JSON.stringify({ op: 'insert', id: doc._id }));
    return doc._id;
  }

  async observeChanges(cursorDescription, ordered, callbacks) {
    const channel = `changes:${cursorDescription.collectionName}`;
    const subscriber = this._client.duplicate();
    await subscriber.subscribe(channel, (message) => {
      const { op, id } = JSON.parse(message);
      // Re-fetch and fire appropriate callback
    });
    return { stop: () => subscriber.unsubscribe(channel) };
  }

  // Selectors: only _id and simple equality supported
  // Complex queries ($gt, $in, etc.) throw

  capabilities() {
    return { reactiveQueries: true };
  }
}
```

### Kafka / event log (hypothetical)

An append-only event log is a different beast. "Insert" appends an event.
"Find" replays and reduces events into materialized state. This is weird
but it works.

```js
class KafkaProvider extends AFS.StreamProvider {
  constructor(brokers, topic) {
    super({ name: 'kafka' });
    this._brokers = brokers;
    this._topic = topic;
    this._materialized = new Map(); // In-memory materialized view
  }

  async insertAsync(collectionName, doc) {
    if (!doc._id) doc._id = this.generateId(collectionName);
    await this._producer.send({
      topic: this._topic,
      messages: [{ value: JSON.stringify({ op: 'insert', collection: collectionName, doc }) }],
    });
    return doc._id;
  }

  // find() queries the materialized in-memory view
  async fetchResults(collectionName, selector) {
    // Filter this._materialized using selector
  }

  // observeChanges driven by Kafka consumer
  async observeChanges(cursorDescription, ordered, callbacks) {
    // Consumer group fires callbacks as events arrive
  }

  capabilities() {
    return { reactiveQueries: true, changeStreams: true };
  }
}
```

### REST API (hypothetical)

For bridging external APIs into Meteor's reactive system:

```js
class RestProvider extends AFS.StreamProvider {
  constructor(baseUrl) {
    super({ name: 'rest' });
    this._baseUrl = baseUrl;
  }

  async fetchResults(collectionName, selector) {
    const params = selectorToQueryString(selector);
    const res = await fetch(`${this._baseUrl}/${collectionName}?${params}`);
    return res.json();
  }

  // Reactivity: poll on interval
  async observeChanges(cursorDescription, ordered, callbacks) {
    const poll = setInterval(async () => {
      const current = await this.fetchResults(/* ... */);
      // Diff against previous results, fire callbacks
    }, 5000);
    return { stop: () => clearInterval(poll) };
  }

  // Writes proxy to REST endpoints
  async insertAsync(collectionName, doc) {
    const res = await fetch(`${this._baseUrl}/${collectionName}`, {
      method: 'POST', body: JSON.stringify(doc),
    });
    return (await res.json())._id;
  }
}
```

## Multiple providers in one app

You can use different databases for different collections:

```js
const pgProvider = new PostgresProvider(process.env.POSTGRES_URL);
const redisProvider = new RedisProvider(process.env.REDIS_URL);

await pgProvider.connect();
await redisProvider.connect();

AFS.registerProvider('postgres', pgProvider);
AFS.registerProvider('redis', redisProvider);

// Persistent data in PostgreSQL
const Users = new AFS.Collection('users', { provider: pgProvider });

// Ephemeral sessions in Redis
const Sessions = new AFS.Collection('sessions', { provider: redisProvider });
```

Both collections work identically from the client's perspective. The
client doesn't know or care which database backs each collection.

### Subscription dedup is per provider instance

afs caches multiplexers per `(cursorDescription, ordered)` *within a
single provider*. Constructing two providers that point at the same
backend results in two independent caches and two physical subscriptions
(e.g. two polling timers, two LISTEN handlers). This is intentional: the
alternative — module-global dedup keyed by backend URL — couples the
lifecycles of unrelated providers and produces silent termination bugs
when one closes. Application code that wants a single physical
subscription should singleton the provider.

## The dev server pattern

Each database adapter can ship a companion `-dev-server` package that
auto-starts a local instance during development:

| Package | Dev server | What it does |
|---------|-----------|--------------|
| `postgres` | `postgres-dev-server` | Downloads PG binary, runs on port+2 |
| `mongo` | `mongo-dev-server` | Ships mongod, runs on port+1 |
| (future) `sqlite` | — | No server needed, file-based |
| (future) `redis` | `redis-dev-server` | Would download and start redis-server |

The dev server packages are `debugOnly: true` — they're stripped from
production builds. In production, you set the connection URL via
environment variable (`POSTGRES_URL`, `MONGO_URL`, etc.).

## Design principles

**Same API, different backend.** If you know `Mongo.Collection`, you know
`AFS.Collection`. No new query language to learn, no new patterns to adopt.
MongoDB-style selectors and modifiers work everywhere (providers translate
them to native queries).

**Providers own the hard parts.** AFS doesn't try to abstract away database
differences. If PostgreSQL can do joins and MongoDB can't, the PostgreSQL
provider exposes that through `capabilities()` and raw access. AFS handles
the common stuff (DDP, cursors, allow/deny) so providers can focus on
database-specific work.

**Zero config in development.** Adding a database to a Meteor app should be
`meteor add` and nothing else. Dev servers, binary management, port
allocation, and data directories are handled automatically. Production
deployment uses standard environment variables.

**Reactivity is not optional.** Every provider must implement
`observeChanges`. The mechanism varies — change streams, LISTEN/NOTIFY,
pub/sub, polling — but the contract is the same. If your database can't
push changes, poll and diff. Real-time is the baseline.

**Escape hatches exist.** `rawDatabase()` and `rawCollection()` give you
direct access to the underlying client. When you need a feature AFS
doesn't abstract (stored procedures, full-text search, aggregation
pipelines), drop down to the native API.
