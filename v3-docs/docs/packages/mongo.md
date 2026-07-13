# mongo

Advanced MongoDB features available in Meteor's `mongo` package.

## MongoDB Collation {#collation}

Collation allows locale-aware string comparison for queries and sorting. Use it when you need case-insensitive search, accent-insensitive matching, or language-specific sort order — without resorting to duplicate lowercase fields or slow regex tricks.

### Installation

Collation is built into the `mongo` package, which is included by default in every Meteor app. No additional packages are required.

### Basic example

```js
import { Mongo } from 'meteor/mongo';

const Books = new Mongo.Collection('books');

// Case-insensitive search for "meteor" — matches "Meteor", "METEOR", etc.
Books.find(
  { title: 'meteor' },
  { collation: { locale: 'en', strength: 2 } }
);
```

The `strength` option controls how strictly strings are compared:

| `strength` | Ignores | Example match |
|------------|---------|---------------|
| `1` | Case and accents | `cafe` = `Café` |
| `2` | Case only | `meteor` = `Meteor`, but `cafe` ≠ `Café` |
| `3` (default) | Nothing | `meteor` ≠ `Meteor` |

### Case-insensitive sort

```js
Books.find(
  {},
  {
    sort: { title: 1 },
    collation: { locale: 'en', strength: 2 },
  }
);
```

Without collation, uppercase letters sort before lowercase in most locales. With `strength: 2` the sort order follows natural alphabetical order regardless of case.

### Server-side and client-side consistency

Collation works on both the server (MongoDB) and the client (Minimongo via `Intl.Collator`). This means:

- Optimistic UI updates apply the same collation rules as the server query.
- The local minimongo cache and the server result set match — no "looks right offline, wrong after sync" bugs.

### Supported options

| Option | Type | Description |
|--------|------|-------------|
| `locale` | string | ICU locale tag, e.g. `'en'`, `'pt'`, `'de'` |
| `strength` | 1–3 | Comparison level (see table above) |
| `caseLevel` | boolean | When `strength` is `1`, also distinguish case |
| `caseFirst` | `'upper'` \| `'lower'` \| `'off'` | Which case sorts first |
| `numericOrdering` | boolean | Sort `"10"` after `"9"` instead of after `"1"` |

### Performance: back collation queries with a collation-aware index

A regular index does **not** accelerate collation queries — the collation must match the index definition:

```js
// Server startup
Books.rawCollection().createIndex(
  { title: 1 },
  { collation: { locale: 'en', strength: 2 } }
);
```

Once the index is in place, `find()` calls with the same collation use the index and avoid full collection scans. Without a matching index, MongoDB falls back to a collection scan for every collation query.

:::tip
Collation queries do not fall back to polling for reactivity. They work correctly with both the oplog and change stream observe drivers.
:::

### Full API reference

See [`Mongo.Collection#find`](/api/collections#Mongo-Collection-find) in the API reference for the complete list of `collation` options.
