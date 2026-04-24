# postgres

PostgreSQL as a first-class Meteor data source, via AFS.

Mongo-style API (`insertAsync`, `updateAsync`, `findOneAsync`,
`observeChanges`) compiled to parameterized SQL against a real Postgres
schema. Reactivity is backed by LISTEN/NOTIFY triggers per collection,
with a polling fallback.

## Status

Experimental. APIs are stable enough to build against; some edges
(subsecond TIMESTAMPTZ precision, regex dialect, JSONB-in-`_extra`) have
documented caveats below. Treat this as "production-ready for
well-scoped workloads, not drop-in mongo parity".

## Installation

```bash
meteor add postgres
```

Declare a connection string via environment variable:

```bash
export POSTGRES_URL='postgres://user:pass@host:5432/db'
```

Or via `Meteor.settings`:

```json
{
  "packages": {
    "postgres": { "url": "postgres://user:pass@host:5432/db" }
  }
}
```

If no URL is configured, the package loads but `new Postgres.Collection`
and `Postgres._query` throw on first use.

## Defining a collection

Each collection maps to one Postgres table. Columns are declared up
front; unknown fields overflow into a JSONB `_extra` column.

```js
import { Postgres } from 'meteor/postgres';

const Posts = new Postgres.Collection('posts', {
  schema: {
    title:     { type: 'text', required: true },
    body:      { type: 'text' },
    views:     { type: 'integer', default: 0 },
    published: { type: 'boolean', default: false },
    tags:      { type: 'jsonb' },
    createdAt: { type: 'timestamp', default: 'now' },
  },
});

await Posts.insertAsync({ title: 'Hello', tags: ['intro'] });
const found = await Posts.findOneAsync({ published: false });
```

### Schema types

| `type`      | Postgres type   | Default options                        |
|-------------|-----------------|----------------------------------------|
| `text`      | `TEXT`          | string default → quoted literal        |
| `integer`   | `INTEGER`       | finite number default only             |
| `numeric`   | `NUMERIC`       | finite number default only             |
| `boolean`   | `BOOLEAN`       | boolean default                        |
| `timestamp` | `TIMESTAMPTZ`   | `'now'` → `DEFAULT NOW()`              |
| `jsonb`     | `JSONB`         | —                                      |

Use `{ required: true }` to emit `NOT NULL`. Non-finite number defaults
(`NaN`, `Infinity`) throw at table-creation time, not at runtime.

### Schema evolution

Schemas are only applied on *first* table creation. Registering a new
schema for an existing table does **not** `ALTER TABLE` — adding, removing,
or retyping columns on a live table is a migration concern that the
package deliberately leaves to the operator (ALTER semantics, default
backfills, and online-migration strategy vary too much to automate
safely). If you change a collection's schema in code:

- For local development: drop the collection (`Posts._provider.dropCollectionAsync('posts')`) and let it be re-created.
- For production: issue the `ALTER TABLE` yourself (via migration tooling or `Postgres._query`) and update the schema registration to match.

Unknown fields overflow into `_extra`, so *additive* JS-side schema
changes (new fields) work without DDL — only column-type changes or
NOT-NULL transitions require a migration.

## Reactivity

`observeChanges` attaches a Postgres trigger that `pg_notify`s on
INSERT/UPDATE/DELETE. The provider maintains a shared LISTEN client per
connection; changes are delivered to observers, which then re-query to
reconcile state. A bounded polling loop catches writes that bypass the
trigger (e.g. raw SQL via `Postgres._query`) and serves as a fallback
after LISTEN reconnects.

Reconnect behaviour:

- On LISTEN-client disconnect the driver re-dials with exponential
  backoff + jitter (up to a capped attempt count), re-LISTENs each
  registered channel, and emits `listen:reconnected` on the driver.
- Observers receive a `reset` on reconnect, then a catch-up poll
  reconciles any writes that happened during the gap.
- If reconnect gives up, the driver emits `listen:gave-up` and the
  polling loop continues to deliver changes.

## Raw SQL

`Postgres._query(sql, params)` executes a parameterized statement
against the connection pool. This bypasses schema conversion, ACLs, and
reactive notifications — caller beware. Writes made via `_query` are
still observable through the polling fallback, but you lose LISTEN
propagation unless your SQL fires the table's trigger.

`Postgres.query` is a deprecation shim for the old name and warns once
per process.

## Environment variables

| Variable                                       | Effect                                                                           | Default |
|------------------------------------------------|----------------------------------------------------------------------------------|---------|
| `POSTGRES_URL`                                 | Connection string                                                                | —       |
| `METEOR_POSTGRES_POLLING_INTERVAL_MS`          | Observer polling cadence (ms). Clamped to 100ms floor.                           | `1000`  |
| `METEOR_POSTGRES_STATEMENT_TIMEOUT_MS`         | Per-statement timeout inside fetch-modify-write transactions. Floor 1000ms.      | `30000` |
| `METEOR_POSTGRES_IDLE_TX_TIMEOUT_MS`           | `idle_in_transaction_session_timeout` inside same transactions. Floor 1000ms.    | `30000` |
| `METEOR_POSTGRES_LISTEN_MAX_LISTENERS`         | EventEmitter max-listener ceiling for the LISTEN client.                         | `1024`  |
| `METEOR_POSTGRES_NUMERIC_BIGINT`               | `=1` to coerce overflowing `numeric` values to BigInt instead of string.         | off     |
| `METEOR_POSTGRES_SUPPRESS_UNKNOWN_TABLE_WARN`  | `=1` to suppress "unregistered table" debug warnings on raw SQL.                 | off     |
| `METEOR_POSTGRES_WARN_UNKNOWN_TABLE`           | `=1` to enable the unregistered-table scan in production (dev-only by default).  | off     |
| `METEOR_POSTGRES_MAX_REGEX_LENGTH`             | Max `$regex` source length accepted by the SQL compiler.                         | `1000`  |
| `METEOR_POSTGRES_POOL_MAX`                     | Maximum pool size (`pool.max`).                                                  | `10`    |
| `METEOR_POSTGRES_POOL_IDLE_TIMEOUT_MS`         | Pool idle timeout (ms) before connections are released.                          | `10000` |
| `METEOR_POSTGRES_POOL_CONNECT_TIMEOUT_MS`      | Pool connect timeout (ms) for new connections.                                   | `0`     |

## Known caveats

### Regex dialect

Postgres regex operators (`~`, `~*`) use POSIX ERE, which diverges from
JavaScript's PCRE. The compiler rejects the following constructs
instead of silently running a different pattern than you wrote:

- Inline flags: `(?i)`, `(?m)`, etc.
- Lookarounds: `(?=…)`, `(?!…)`, `(?<=…)`, `(?<!…)`
- Character-class shorthands: `\d`, `\D`, `\w`, `\W`, `\s`, `\S`

Use POSIX classes instead: `[[:digit:]]`, `[[:alpha:]]`, `[[:space:]]`.
Both `$regex: '…'` (with optional sibling `$options: 'i'`) and
`$regex: /…/flags` forms are supported; flags from both sources are
unioned.

The compiler also rejects obvious nested-quantifier ReDoS patterns
(`(a+)+`, `(a*)*`) and caps source length at
`METEOR_POSTGRES_MAX_REGEX_LENGTH` (default 1000). It does *not*
detect alternation-overlap patterns such as `(a|a)+` — Postgres'
regex engine handles these well in practice, but if you pass
untrusted regex sources, treat the length cap as the primary defence
and validate separately at your input boundary.

### TIMESTAMPTZ precision

Postgres `TIMESTAMPTZ` stores microseconds; JavaScript `Date` stores
milliseconds. Writes round-trip cleanly as milliseconds; reads of
values written from outside Meteor may lose sub-millisecond precision.

### `_extra` overflow column

Unknown fields are serialized to JSONB in the `_extra` column. This is
convenient for flexible schemas but has cost implications:

- Queries on `_extra.foo` paths cannot use column indexes; add a
  targeted GIN or expression index if you filter on them hotly.
- Selectors on `_extra` paths type-cast at query time.

Model anything you'll query or sort on as a real column.

### Numeric precision on JSONB paths

`$inc`, `$mul`, `$min`, `$max` against `_extra` or `jsonb` fields go
through `numeric` and return through JSON, which may lose precision
for values outside safe-integer range. Model high-precision counters
as `numeric` columns.

### Array modifier overhead

`$addToSet`, `$pull`, `$pullAll`, and `$pop` always route through the
fetch-modify-write path: the driver issues a `SELECT ... FOR UPDATE`
under `REPEATABLE READ`, runs `LocalCollection._modify()` on the fetched
row, then writes it back. This is an extra round-trip per document versus
a pure SQL `UPDATE`. Batch where possible if latency matters.

### Concurrency

- Multi-document updates wrapping a `$push`/`$pull`/`$addToSet`/`$rename`
  (fetch-modify-write path) run under `REPEATABLE READ` with 3 retries
  on serialization failure (40001). Non-FMW updates run with default
  isolation.
- Single-document updates with a non-`_id` selector and `options.sort`
  pick a deterministic row via `ORDER BY … LIMIT 1` inside the UPDATE
  subquery.

### Security

- All identifiers (table names, column names, JSONB path segments) are
  double-quoted with embedded quotes doubled; values use `$N`
  parameterization exclusively.
- Prototype-bearing keys (`__proto__`, `constructor`, `prototype`) are
  rejected at every boundary that becomes a SQL identifier or JSONB
  path.
- The trigger function is created with
  `SET search_path = pg_catalog, pg_temp` and uses schema-qualified
  `pg_catalog.pg_notify` / `pg_catalog.jsonb_build_object` to prevent
  search-path hijacks.
- Collection names are validated for length before trigger function
  naming to avoid NAMEDATALEN (63-byte) collisions.

This package assumes the Postgres server has
`standard_conforming_strings = on` (default since 9.1). Deployments
that flip this off can cause backslash-containing literals to be
interpreted as escape strings.

## Running tests

Unit tests need no database:

```bash
./packages/test-in-console/run.sh postgres
```

Integration tests require a live Postgres:

```bash
export POSTGRES_URL='postgres://postgres:postgres@localhost:5432/test'
./packages/test-in-console/run.sh postgres
```

CI runs both via a Postgres service container; see
`.github/workflows/test-postgres.yml`.
