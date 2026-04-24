/**
 * Postgres package test suite.
 *
 * Unit tests (no database required):
 *   - Schema resolution (resolveField)
 *   - Selector compilation
 *   - Modifier compilation
 *   - Sort compilation
 *   - Row converter round-trips
 *
 * Integration tests (require POSTGRES_URL):
 *   - Table creation
 *   - Insert / find / findOne
 *   - Update with $set, $inc, $unset
 *   - Update with fetch-modify-write ($push, $pull, $addToSet)
 *   - Remove
 *   - Upsert
 *   - Sort / limit / skip
 *   - _extra overflow fields
 *   - observeChanges
 *   - Multi-document update
 *   - Nested JSONB queries
 *   - Convenience constructor
 *   - AFS provider registration
 */

import { resolveField, ResolvedSchema, quoteIdent, quoteLiteral, quoteTextArray } from './schema';
import { documentToRow, rowToDocument } from './row_converter';
import { PostgresStreamProvider } from './postgres_stream_provider';
import { PostgresConnection } from './postgres_driver';
import {
  CompilationContext,
  compileSelector,
  compileModifier,
  compileSort,
  buildSelectQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildUpsertQuery,
} from './sql_compiler';
import { POLLING_INTERVAL_MS } from './observe_driver';

// ---------------------------------------------------------------------------
// Helper: create a test schema
// ---------------------------------------------------------------------------

function createTestSchema() {
  return new ResolvedSchema({
    title:     { type: 'text', required: true },
    body:      { type: 'text' },
    views:     { type: 'integer', default: 0 },
    published: { type: 'boolean', default: false },
    tags:      { type: 'jsonb' },
    metadata:  { type: 'jsonb' },
    createdAt: { type: 'timestamp', default: 'now' },
  });
}

// ============================================================================
// UNIT TESTS — Schema Resolution
// ============================================================================

Tinytest.add('postgres - schema - resolveField - _id', (test) => {
  const schema = createTestSchema();
  const r = resolveField('_id', schema);
  test.equal(r.kind, 'column');
  test.equal(r.sqlRef, '_id');
  test.equal(r.columnType, 'text');
});

Tinytest.add('postgres - schema - resolveField - column (text)', (test) => {
  const schema = createTestSchema();
  const r = resolveField('title', schema);
  test.equal(r.kind, 'column');
  test.equal(r.sqlRef, '"title"');
  test.equal(r.columnType, 'text');
  test.equal(r.needsCast, false);
});

Tinytest.add('postgres - schema - resolveField - column (integer)', (test) => {
  const schema = createTestSchema();
  const r = resolveField('views', schema);
  test.equal(r.kind, 'column');
  test.equal(r.sqlRef, '"views"');
  test.equal(r.columnType, 'integer');
});

Tinytest.add('postgres - schema - resolveField - column (timestamp, needs quoting)', (test) => {
  const schema = createTestSchema();
  const r = resolveField('createdAt', schema);
  test.equal(r.kind, 'column');
  test.equal(r.sqlRef, '"createdAt"');
  test.equal(r.columnType, 'timestamp');
});

Tinytest.add('postgres - schema - resolveField - jsonb_column', (test) => {
  const schema = createTestSchema();
  const r = resolveField('metadata', schema);
  test.equal(r.kind, 'jsonb_column');
  test.equal(r.sqlRef, '"metadata"');
  test.equal(r.columnType, 'jsonb');
});

Tinytest.add('postgres - schema - resolveField - jsonb_path (single level)', (test) => {
  const schema = createTestSchema();
  const r = resolveField('metadata.key', schema);
  test.equal(r.kind, 'jsonb_path');
  test.equal(r.sqlRef, "\"metadata\"->>'key'");
  test.isTrue(r.needsCast);
  test.equal(r.jsonPath, ['key']);
});

Tinytest.add('postgres - schema - resolveField - jsonb_path (nested)', (test) => {
  const schema = createTestSchema();
  const r = resolveField('metadata.a.b', schema);
  test.equal(r.kind, 'jsonb_path');
  test.equal(r.sqlRef, "\"metadata\" #>> ARRAY['a', 'b']");
  test.isTrue(r.needsCast);
  test.equal(r.jsonPath, ['a', 'b']);
});

Tinytest.add('postgres - schema - resolveField - extra (unknown field)', (test) => {
  const schema = createTestSchema();
  const r = resolveField('unknownField', schema);
  test.equal(r.kind, 'extra');
  test.equal(r.sqlRef, "_extra->>'unknownField'");
  test.isTrue(r.needsCast);
});

Tinytest.add('postgres - schema - resolveField - extra_path (unknown nested)', (test) => {
  const schema = createTestSchema();
  const r = resolveField('unknown.nested', schema);
  test.equal(r.kind, 'extra_path');
  test.equal(r.sqlRef, "_extra #>> ARRAY['unknown', 'nested']");
  test.isTrue(r.needsCast);
});

Tinytest.add('postgres - schema - quoteIdent', (test) => {
  // C2: quoteIdent now always quotes, unconditionally. The old lowercase
  // bypass was the root cause of identifiers like `1users` being emitted
  // unquoted (producing parse errors) and of adversarial identifiers like
  // `users_or_1_eq_1` slipping through unquoted.
  test.equal(quoteIdent('users'), '"users"');
  test.equal(quoteIdent('simple'), '"simple"');
  test.equal(quoteIdent('createdAt'), '"createdAt"');
  test.equal(quoteIdent('select'), '"select"');
  test.equal(quoteIdent('user'), '"user"');
  test.equal(quoteIdent('_id'), '"_id"');
  test.equal(quoteIdent('_extra'), '"_extra"');
  // Leading digit — Postgres rejects as unquoted identifier.
  test.equal(quoteIdent('1users'), '"1users"');
  // Embedded double quote must be escaped by doubling.
  test.equal(quoteIdent('users"drop'), '"users""drop"');
  // Reserved-word-looking simple identifier must still be quoted.
  test.equal(quoteIdent('users_or_1_eq_1'), '"users_or_1_eq_1"');
});

Tinytest.add('postgres - schema - quoteLiteral', (test) => {
  test.equal(quoteLiteral("O'Reilly"), "'O''Reilly'");
  test.equal(quoteLiteral(null), 'NULL');
});

Tinytest.add('postgres - schema - quoteTextArray', (test) => {
  test.equal(quoteTextArray(['a', "b'c"]), "ARRAY['a', 'b''c']");
});

Tinytest.add('postgres - schema - ResolvedSchema constructor validates types', (test) => {
  test.throws(() => {
    new ResolvedSchema({ field: { type: 'invalid' } });
  }, /Invalid column type/);
});

Tinytest.add('postgres - schema - ResolvedSchema column definitions', (test) => {
  const schema = createTestSchema();
  const defs = schema.getColumnDefinitions();
  test.isTrue(defs.length === 7);
  test.isTrue(defs[0].includes('TEXT NOT NULL')); // title
  test.isTrue(defs.some(d => d.includes('INTEGER DEFAULT 0'))); // views
  test.isTrue(defs.some(d => d.includes('BOOLEAN DEFAULT false'))); // published
  test.isTrue(defs.some(d => d.includes('TIMESTAMPTZ DEFAULT NOW()'))); // createdAt
});

Tinytest.add('postgres - schema - ResolvedSchema escapes string defaults', (test) => {
  const schema = new ResolvedSchema({
    publisher: { type: 'text', default: "O'Reilly" },
  });
  const defs = schema.getColumnDefinitions();
  test.equal(defs, ['"publisher" TEXT DEFAULT \'O\'\'Reilly\'']);
});

Tinytest.addAsync('postgres - driver - setupListenNotify handles escaping and deduplication', async (test) => {
  const conn = new PostgresConnection('postgres://example');
  conn._notifyCallbacks = new Map();
  // Use both single and double quotes to exercise literal and identifier escaping together.
  const collectionName = `posts'"draft"`;
  const channel = `meteor_pg_${collectionName}`;
  const triggerName = `${channel}_notify_trigger`;
  const queries = [];
  const listenQueries = [];
  let directQueryCalls = 0;

  conn.getClient = async () => ({
    query: async (text) => {
      queries.push(text);
      return { rows: [], rowCount: 0 };
    },
    release() {},
  });

  conn.query = async () => {
    directQueryCalls += 1;
    return { rows: [], rowCount: 0 };
  };

  conn._ensureListenClient = async () => {
    conn._listenClient = {
      on() {},
      query: async (text) => {
        listenQueries.push(text);
        return { rows: [], rowCount: 0 };
      },
    };
    conn._attachListenClientHandlers(conn._listenClient);
  };

  const callback = () => {};
  await conn.setupListenNotify(collectionName, callback);
  await conn.setupListenNotify(collectionName, callback);

  test.equal(queries[0], 'BEGIN');
  test.isTrue(queries[1].includes(`pg_notify(${quoteLiteral(channel)}`));
  test.isFalse(queries[1].includes(`pg_notify('${channel}'`));
  test.isTrue(queries[2].includes(`tgname = ${quoteLiteral(triggerName)}`));
  test.equal(queries[3], 'COMMIT');
  test.equal(queries.length, 4);
  test.equal(directQueryCalls, 0);
  test.equal(listenQueries, [`LISTEN ${quoteIdent(channel)}`]);
});

Tinytest.addAsync('postgres - driver - ensureListenClient attaches shared handlers', async (test) => {
  const conn = new PostgresConnection('postgres://example');
  const listenClient = { on() {} };
  let attachedClient = null;

  conn._pool = {
    connect: async () => listenClient,
  };
  conn._attachListenClientHandlers = (client) => {
    attachedClient = client;
  };

  await conn._ensureListenClient();

  test.equal(conn._listenClient, listenClient);
  test.equal(attachedClient, listenClient);
});

Tinytest.addAsync('postgres - driver - setupListenNotify rolls back trigger setup failures', async (test) => {
  const conn = new PostgresConnection('postgres://example');
  const queries = [];
  let released = false;
  const expectedError = new Error('boom');

  conn.getClient = async () => ({
    query: async (text) => {
      queries.push(text);
      if (text.includes('CREATE OR REPLACE FUNCTION')) {
        throw expectedError;
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      released = true;
    },
  });
  conn._ensureListenClient = async () => {
    throw new Error('should not listen after trigger setup failure');
  };

  await test.throwsAsync(async () => {
    await conn.setupListenNotify('posts', () => {});
  }, /boom/);

  test.equal(queries[0], 'BEGIN');
  test.equal(queries[2], 'ROLLBACK');
  test.isTrue(released);
});

// ============================================================================
// UNIT TESTS — Selector Compiler
// ============================================================================

Tinytest.add('postgres - selector - empty selector', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({}, schema);
  test.equal(text, 'TRUE');
  test.equal(values.length, 0);
});

Tinytest.add('postgres - selector - _id equality', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ _id: 'abc' }, schema);
  test.equal(text, '_id = $1');
  test.equal(values, ['abc']);
});

Tinytest.add('postgres - selector - column equality', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ title: 'hello' }, schema);
  test.equal(text, '"title" = $1');
  test.equal(values, ['hello']);
});

Tinytest.add('postgres - selector - boolean equality', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ published: true }, schema);
  test.equal(text, '"published" = $1');
  test.equal(values, [true]);
});

Tinytest.add('postgres - selector - $gt on column', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ views: { $gt: 5 } }, schema);
  test.equal(text, '"views" > $1');
  test.equal(values, [5]);
});

Tinytest.add('postgres - selector - $gte $lte combined', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ views: { $gte: 1, $lte: 10 } }, schema);
  test.equal(text, '("views" >= $1 AND "views" <= $2)');
  test.equal(values, [1, 10]);
});

Tinytest.add('postgres - selector - $in on column', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ views: { $in: [1, 2, 3] } }, schema);
  test.equal(text, '"views" = ANY($1)');
  test.length(values, 1);
  test.equal(values[0], [1, 2, 3]);
});

Tinytest.add('postgres - selector - $exists true', (test) => {
  const schema = createTestSchema();
  const { text } = compileSelector({ title: { $exists: true } }, schema);
  test.equal(text, '"title" IS NOT NULL');
});

Tinytest.add('postgres - selector - $exists false', (test) => {
  const schema = createTestSchema();
  const { text } = compileSelector({ title: { $exists: false } }, schema);
  test.equal(text, '"title" IS NULL');
});

Tinytest.add('postgres - selector - $regex', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ title: { $regex: '^he' } }, schema);
  test.equal(text, '"title" ~ $1');
  test.equal(values, ['^he']);
});

Tinytest.add('postgres - selector - $mod', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ views: { $mod: [10, 1] } }, schema);
  test.equal(text, '"views" % $1 = $2');
  test.equal(values, [10, 1]);
});

Tinytest.add('postgres - selector - $ne on column', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ published: { $ne: true } }, schema);
  test.equal(text, '("published" != $1 OR "published" IS NULL)');
  test.equal(values, [true]);
});

Tinytest.add('postgres - selector - JSONB path equality', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ 'metadata.key': 'v' }, schema);
  test.equal(text, "\"metadata\"->>'key' = $1");
  test.equal(values, ['v']);
});

Tinytest.add('postgres - selector - JSONB nested path with numeric cast', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ 'metadata.a.b': 5 }, schema);
  test.equal(text, "(\"metadata\" #>> ARRAY['a', 'b'])::numeric = $1");
  test.equal(values, [5]);
});

Tinytest.add('postgres - selector - JSONB $all', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ tags: { $all: ['a', 'b'] } }, schema);
  test.equal(text, '"tags" @> $1::jsonb');
  test.equal(values, [JSON.stringify(['a', 'b'])]);
});

Tinytest.add('postgres - selector - JSONB $size', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ tags: { $size: 3 } }, schema);
  test.equal(text, 'jsonb_array_length("tags") = $1');
  test.equal(values, [3]);
});

Tinytest.add('postgres - selector - _extra field equality', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ unknownField: 'x' }, schema);
  test.equal(text, "_extra->>'unknownField' = $1");
  test.equal(values, ['x']);
});

Tinytest.add('postgres - selector - _extra nested path', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ 'unknown.nested': 5 }, schema);
  test.equal(text, "(_extra #>> ARRAY['unknown', 'nested'])::numeric = $1");
  test.equal(values, [5]);
});

Tinytest.add('postgres - selector - $type escapes string literal', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({
    metadata: { $type: "string' OR '1'='1" },
  }, schema);
  test.equal(text, "jsonb_typeof(\"metadata\") = 'string'' OR ''1''=''1'");
  test.equal(values, []);
});

Tinytest.add('postgres - selector - $and', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({
    $and: [{ title: 'hello' }, { views: { $gt: 0 } }]
  }, schema);
  test.equal(text, '("title" = $1 AND "views" > $2)');
  test.equal(values, ['hello', 0]);
});

Tinytest.add('postgres - selector - $or', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({
    $or: [{ title: 'a' }, { title: 'b' }]
  }, schema);
  test.equal(text, '("title" = $1 OR "title" = $2)');
  test.equal(values, ['a', 'b']);
});

Tinytest.add('postgres - selector - $nor', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({
    $nor: [{ published: true }, { views: 0 }]
  }, schema);
  test.equal(text, 'NOT ("published" = $1 OR "views" = $2)');
  test.equal(values, [true, 0]);
});

Tinytest.add('postgres - selector - $not (operator)', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({
    views: { $not: { $gt: 5 } }
  }, schema);
  test.equal(text, 'NOT ("views" > $1)');
  test.equal(values, [5]);
});

Tinytest.add('postgres - selector - $where throws', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileSelector({ $where: 'this.x > 0' }, schema);
  }, /\$where is not supported/);
});

Tinytest.add('postgres - selector - $elemMatch', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({
    tags: { $elemMatch: { $gt: 5 } }
  }, schema);
  test.isTrue(text.includes('EXISTS'));
  test.isTrue(text.includes('jsonb_array_elements'));
});

Tinytest.add('postgres - selector - JSONB column equality (array containment)', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ tags: 'a' }, schema);
  // Should compile to both equality and containment check
  test.isTrue(text.includes('@>'));
  test.isTrue(text.includes('OR'));
});

Tinytest.add('postgres - selector - $nin', (test) => {
  const schema = createTestSchema();
  const { text, values } = compileSelector({ views: { $nin: [1, 2] } }, schema);
  test.equal(text, 'NOT ("views" = ANY($1))');
  test.equal(values[0], [1, 2]);
});

// ============================================================================
// UNIT TESTS — Modifier Compiler
// ============================================================================

Tinytest.add('postgres - modifier - $set column', (test) => {
  const schema = createTestSchema();
  const { setClauses, values, needsFetchModifyWrite } = compileModifier(
    { $set: { title: 'New' } }, schema
  );
  test.isFalse(needsFetchModifyWrite);
  test.equal(setClauses.length, 1);
  test.equal(setClauses[0], '"title" = $1');
  test.equal(values, ['New']);
});

Tinytest.add('postgres - modifier - $set jsonb path', (test) => {
  const schema = createTestSchema();
  const { setClauses, values } = compileModifier(
    { $set: { 'metadata.k': 'v' } }, schema
  );
  test.equal(setClauses.length, 1);
  test.isTrue(setClauses[0].includes('jsonb_set'));
  test.isTrue(setClauses[0].includes("ARRAY['k']"));
});

Tinytest.add('postgres - modifier - $set extra', (test) => {
  const schema = createTestSchema();
  const { setClauses } = compileModifier(
    { $set: { unknown: 'v' } }, schema
  );
  test.equal(setClauses.length, 1);
  test.isTrue(setClauses[0].includes('_extra'));
  test.isTrue(setClauses[0].includes('jsonb_set'));
});

Tinytest.add('postgres - modifier - $unset column', (test) => {
  const schema = createTestSchema();
  const { setClauses } = compileModifier(
    { $unset: { title: 1 } }, schema
  );
  test.equal(setClauses.length, 1);
  test.equal(setClauses[0], '"title" = NULL');
});

Tinytest.add('postgres - modifier - $unset jsonb path', (test) => {
  const schema = createTestSchema();
  const { setClauses } = compileModifier(
    { $unset: { 'metadata.k': 1 } }, schema
  );
  test.isTrue(setClauses[0].includes("- 'k'"));
});

Tinytest.add('postgres - modifier - $unset extra', (test) => {
  const schema = createTestSchema();
  const { setClauses } = compileModifier(
    { $unset: { unknown: 1 } }, schema
  );
  test.isTrue(setClauses[0].includes("_extra - 'unknown'"));
});

Tinytest.add('postgres - modifier - json path segments are escaped', (test) => {
  const schema = createTestSchema();
  const { setClauses } = compileModifier(
    { $set: { "metadata.k' ] , '{}'::jsonb) --": 'v' } }, schema
  );
  test.isTrue(setClauses[0].includes("ARRAY['k'' ] , ''{}''::jsonb) --']"));
  test.isFalse(setClauses[0].includes("'{k' ] , '{}'::jsonb) --}'"));
});

Tinytest.add('postgres - modifier - $inc column', (test) => {
  const schema = createTestSchema();
  const { setClauses, values } = compileModifier(
    { $inc: { views: 1 } }, schema
  );
  test.equal(setClauses[0], '"views" = COALESCE("views", 0) + $1');
  test.equal(values, [1]);
});

Tinytest.add('postgres - modifier - $mul column', (test) => {
  const schema = createTestSchema();
  const { setClauses, values } = compileModifier(
    { $mul: { views: 2 } }, schema
  );
  test.equal(setClauses[0], '"views" = COALESCE("views", 0) * $1');
  test.equal(values, [2]);
});

Tinytest.add('postgres - modifier - $min column', (test) => {
  const schema = createTestSchema();
  const { setClauses, values } = compileModifier(
    { $min: { views: 5 } }, schema
  );
  test.isTrue(setClauses[0].includes('LEAST'));
});

Tinytest.add('postgres - modifier - $max column', (test) => {
  const schema = createTestSchema();
  const { setClauses, values } = compileModifier(
    { $max: { views: 5 } }, schema
  );
  test.isTrue(setClauses[0].includes('GREATEST'));
});

Tinytest.add('postgres - modifier - $currentDate', (test) => {
  const schema = createTestSchema();
  const { setClauses } = compileModifier(
    { $currentDate: { createdAt: true } }, schema
  );
  test.isTrue(setClauses[0].includes('NOW()'));
});

Tinytest.add('postgres - modifier - replacement doc', (test) => {
  const schema = createTestSchema();
  const { setClauses, values, needsFetchModifyWrite } = compileModifier(
    { title: 'New Title', views: 10 }, schema
  );
  test.isFalse(needsFetchModifyWrite);
  test.isTrue(setClauses.length > 0);
  // Should set all schema columns
  test.isTrue(setClauses.some(c => c.includes('title')));
  test.isTrue(setClauses.some(c => c.includes('views')));
});

Tinytest.add('postgres - modifier - $push (simple) on jsonb column', (test) => {
  const schema = createTestSchema();
  const { setClauses, needsFetchModifyWrite } = compileModifier(
    { $push: { tags: 'x' } }, schema
  );
  test.isFalse(needsFetchModifyWrite);
  test.isTrue(setClauses[0].includes('||'));
});

Tinytest.add('postgres - modifier - $push with $each triggers fetch-modify-write', (test) => {
  const schema = createTestSchema();
  const { needsFetchModifyWrite } = compileModifier(
    { $push: { tags: { $each: ['x', 'y'] } } }, schema
  );
  test.isTrue(needsFetchModifyWrite);
});

Tinytest.add('postgres - modifier - $pull triggers fetch-modify-write', (test) => {
  const schema = createTestSchema();
  const { needsFetchModifyWrite } = compileModifier(
    { $pull: { tags: 'x' } }, schema
  );
  test.isTrue(needsFetchModifyWrite);
});

Tinytest.add('postgres - modifier - $addToSet triggers fetch-modify-write', (test) => {
  const schema = createTestSchema();
  const { needsFetchModifyWrite } = compileModifier(
    { $addToSet: { tags: 'x' } }, schema
  );
  test.isTrue(needsFetchModifyWrite);
});

Tinytest.add('postgres - modifier - $rename triggers fetch-modify-write', (test) => {
  const schema = createTestSchema();
  const { needsFetchModifyWrite } = compileModifier(
    { $rename: { title: 'name' } }, schema
  );
  test.isTrue(needsFetchModifyWrite);
});

// ============================================================================
// UNIT TESTS — Sort Compiler
// ============================================================================

Tinytest.add('postgres - sort - single column asc', (test) => {
  const schema = createTestSchema();
  const result = compileSort({ title: 1 }, schema);
  test.equal(result, '"title" ASC NULLS LAST');
});

Tinytest.add('postgres - sort - single column desc', (test) => {
  const schema = createTestSchema();
  const result = compileSort({ views: -1 }, schema);
  test.equal(result, '"views" DESC NULLS LAST');
});

Tinytest.add('postgres - sort - _id', (test) => {
  const schema = createTestSchema();
  const result = compileSort({ _id: 1 }, schema);
  test.equal(result, '_id ASC NULLS LAST');
});

Tinytest.add('postgres - sort - jsonb path', (test) => {
  const schema = createTestSchema();
  const result = compileSort({ 'metadata.k': 1 }, schema);
  test.equal(result, "\"metadata\"->>'k' ASC NULLS LAST");
});

Tinytest.add('postgres - sort - multi-field', (test) => {
  const schema = createTestSchema();
  const result = compileSort({ views: -1, title: 1 }, schema);
  test.equal(result, '"views" DESC NULLS LAST, "title" ASC NULLS LAST');
});

Tinytest.add('postgres - sort - null/empty', (test) => {
  test.equal(compileSort(null, null), '');
  test.equal(compileSort({}, null), '');
});

// ============================================================================
// UNIT TESTS — Row Converter
// ============================================================================

Tinytest.add('postgres - row converter - documentToRow basic', (test) => {
  const schema = createTestSchema();
  const doc = { _id: '123', title: 'Hello', views: 5, unknownField: 'extra' };
  const row = documentToRow(doc, schema);

  test.equal(row._id, '123');
  test.equal(row.title, 'Hello');
  test.equal(row.views, 5);
  test.equal(row._extra.unknownField, 'extra');
});

Tinytest.add('postgres - row converter - rowToDocument basic', (test) => {
  const schema = createTestSchema();
  const row = {
    _id: '123',
    title: 'Hello',
    body: null,
    views: 5,
    published: false,
    tags: null,
    metadata: null,
    createdAt: new Date('2024-01-01'),
    _extra: { unknownField: 'extra' },
  };
  const doc = rowToDocument(row, schema);

  test.equal(doc._id, '123');
  test.equal(doc.title, 'Hello');
  test.equal(doc.views, 5);
  test.equal(doc.published, false);
  test.equal(doc.unknownField, 'extra');
  // body should be omitted (NULL)
  test.isFalse('body' in doc);
  // tags should be omitted (NULL)
  test.isFalse('tags' in doc);
});

Tinytest.add('postgres - row converter - round-trip', (test) => {
  const schema = createTestSchema();
  const original = {
    _id: 'abc',
    title: 'Test',
    views: 42,
    published: true,
    tags: ['a', 'b'],
    metadata: { key: 'value' },
    extraField: 'overflow',
  };

  const row = documentToRow(original, schema);
  const roundTripped = rowToDocument(row, schema);

  test.equal(roundTripped._id, original._id);
  test.equal(roundTripped.title, original.title);
  test.equal(roundTripped.views, original.views);
  test.equal(roundTripped.published, original.published);
  test.equal(roundTripped.tags, original.tags);
  test.equal(roundTripped.metadata.key, original.metadata.key);
  test.equal(roundTripped.extraField, original.extraField);
});

Tinytest.add('postgres - row converter - _extra empty when no overflow', (test) => {
  const schema = createTestSchema();
  const doc = { _id: '1', title: 'Hi', views: 0 };
  const row = documentToRow(doc, schema);
  test.equal(Object.keys(row._extra).length, 0);
});

Tinytest.add('postgres - row converter - NULL handling', (test) => {
  const schema = createTestSchema();
  const row = {
    _id: '1',
    title: 'x',
    body: null,
    views: null,
    published: null,
    tags: null,
    metadata: null,
    createdAt: null,
    _extra: {},
  };
  const doc = rowToDocument(row, schema);
  // Only _id and title should be present
  test.equal(Object.keys(doc).length, 2);
  test.equal(doc._id, '1');
  test.equal(doc.title, 'x');
});

// ============================================================================
// UNIT TESTS — Query Builders
// ============================================================================

Tinytest.add('postgres - query builder - buildSelectQuery', (test) => {
  const schema = createTestSchema();
  const { text, values } = buildSelectQuery(
    'posts', { published: true }, { sort: { createdAt: -1 }, limit: 10, skip: 5 }, schema
  );
  test.isTrue(text.includes('SELECT * FROM "posts"'));
  test.isTrue(text.includes('WHERE "published" = $1'));
  test.isTrue(text.includes('ORDER BY'));
  test.isTrue(text.includes('LIMIT'));
  test.isTrue(text.includes('OFFSET'));
  test.equal(values[0], true);
});

Tinytest.add('postgres - query builder - buildInsertQuery', (test) => {
  const schema = createTestSchema();
  const { text, values } = buildInsertQuery(
    'posts', { _id: '1', title: 'Hi', views: 0 }, schema
  );
  test.isTrue(text.includes('INSERT INTO "posts"'));
  test.isTrue(text.includes('RETURNING _id'));
  test.isTrue(values.includes('1'));
  test.isTrue(values.includes('Hi'));
});

Tinytest.add('postgres - query builder - buildDeleteQuery', (test) => {
  const schema = createTestSchema();
  const { text, values } = buildDeleteQuery(
    'posts', { _id: '1' }, schema
  );
  test.isTrue(text.includes('DELETE FROM "posts"'));
  test.isTrue(text.includes('WHERE _id = $1'));
  test.equal(values, ['1']);
});

Tinytest.add('postgres - query builder - buildUpdateQuery (non-multi)', (test) => {
  const schema = createTestSchema();
  const { text, values } = buildUpdateQuery(
    'posts', { published: true }, { $set: { title: 'New' } }, {}, schema
  );
  // Non-multi: should use subquery with LIMIT 1
  test.isTrue(text.includes('UPDATE "posts" SET "title" = $1'));
  test.isTrue(text.includes('LIMIT 1'));
  test.equal(values[0], 'New');
});

Tinytest.add('postgres - query builder - buildUpdateQuery (multi)', (test) => {
  const schema = createTestSchema();
  const { text, values } = buildUpdateQuery(
    'posts', { published: true }, { $inc: { views: 1 } }, { multi: true }, schema
  );
  test.isTrue(text.includes('UPDATE "posts" SET'));
  test.isFalse(text.includes('LIMIT 1'));
  test.isTrue(text.includes('COALESCE'));
});

Tinytest.add('postgres - query builder - buildUpsertQuery', (test) => {
  const schema = createTestSchema();
  const { text, values } = buildUpsertQuery(
    'posts', { _id: '1' }, { $set: { title: 'Upserted' } }, schema
  );
  test.isTrue(text.includes('INSERT INTO "posts"'));
  test.isTrue(text.includes('ON CONFLICT (_id) DO UPDATE'));
  test.isTrue(text.includes('RETURNING _id'));
});

Tinytest.add('postgres - query builder - C1 - buildUpsertQuery non-_id selector emits CTE (update-or-insert)', (test) => {
  const schema = new ResolvedSchema({
    slug: { type: 'text' },
    views: { type: 'integer', default: 0 },
  });
  const { text, values, insertedId } = buildUpsertQuery(
    'posts', { slug: 'foo' }, { $set: { views: 5 } }, schema
  );
  // New behavior: a CTE with an UPDATE pass (matched row) and an INSERT
  // pass guarded by NOT EXISTS. No ON CONFLICT path — that would require
  // a unique index on `slug` which the collection does not declare.
  test.isTrue(text.includes('WITH updated AS'), `SQL: ${text}`);
  test.isTrue(text.includes('UPDATE "posts"'));
  test.isTrue(text.includes('WHERE NOT EXISTS (SELECT 1 FROM updated)'));
  test.isTrue(text.includes('INSERT INTO "posts"'));
  test.isTrue(text.includes('UNION ALL'));
  test.isFalse(text.includes('ON CONFLICT'), 'CTE path must not use ON CONFLICT(_id)');
  // Fresh _id generated for the insert branch.
  test.isTrue(typeof insertedId === 'string' && insertedId.length > 0);
  // Values include the modifier operand and the selector equality operand.
  test.isTrue(values.includes(5));
  test.isTrue(values.includes('foo'));
});

// ============================================================================
// UNIT TESTS — CompilationContext
// ============================================================================

Tinytest.add('postgres - CompilationContext - addParam tracking', (test) => {
  const ctx = new CompilationContext();
  test.equal(ctx.addParam('a'), '$1');
  test.equal(ctx.addParam('b'), '$2');
  test.equal(ctx.addParam(3), '$3');
  test.equal(ctx.values, ['a', 'b', 3]);
  test.equal(ctx.paramCount, 3);
});

// ============================================================================
// INTEGRATION TESTS — require POSTGRES_URL
// ============================================================================

const POSTGRES_URL = process.env.POSTGRES_URL;
const hasPostgres = !!POSTGRES_URL;

if (hasPostgres) {
  // Use a unique table name per test run to avoid conflicts
  const testTableName = `test_pg_${Random.id(8).toLowerCase()}`;
  let testProvider = null;

  // Helper to create a fresh provider + collection for integration tests
  async function setupIntegrationTest() {


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();

    const schema = new ResolvedSchema({
      title:     { type: 'text', required: true },
      body:      { type: 'text' },
      views:     { type: 'integer', default: 0 },
      published: { type: 'boolean', default: false },
      tags:      { type: 'jsonb' },
      metadata:  { type: 'jsonb' },
      createdAt: { type: 'timestamp', default: 'now' },
    });

    await provider.registerSchema(testTableName, schema);
    return { provider, schema };
  }

  Tinytest.addAsync('postgres - integration - table auto-creation', async (test) => {
    const { provider } = await setupIntegrationTest();
    try {
      // Table should exist
      const result = await provider._connection.query(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = $1)`,
        [testTableName]
      );
      test.isTrue(result.rows[0].exists);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(testTableName)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - insert and find', async (test) => {
    const table = `test_if_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      title: { type: 'text', required: true },
      views: { type: 'integer', default: 0 },
    });
    await provider.registerSchema(table, schema);

    try {
      const id = await provider.insertAsync(table, { title: 'Hello', views: 10 });
      test.isTrue(typeof id === 'string');

      const results = await provider._fetchResults(table, { _id: id }, {});
      test.equal(results.length, 1);
      test.equal(results[0].title, 'Hello');
      test.equal(results[0].views, 10);
      test.equal(results[0]._id, id);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - findOne', async (test) => {
    const table = `test_fo_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({ title: { type: 'text' } });
    await provider.registerSchema(table, schema);

    try {
      await provider.insertAsync(table, { title: 'First' });
      await provider.insertAsync(table, { title: 'Second' });

      const doc = await provider.findOneAsync(table, { title: 'First' });
      test.equal(doc.title, 'First');
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - update with $set', async (test) => {
    const table = `test_us_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      title: { type: 'text' },
      views: { type: 'integer', default: 0 },
    });
    await provider.registerSchema(table, schema);

    try {
      const id = await provider.insertAsync(table, { title: 'Old', views: 0 });
      const affected = await provider.updateAsync(table, { _id: id }, { $set: { title: 'New' } });
      test.equal(affected, 1);

      const doc = await provider.findOneAsync(table, { _id: id });
      test.equal(doc.title, 'New');
      test.equal(doc.views, 0);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - update with $inc', async (test) => {
    const table = `test_ui_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      title: { type: 'text' },
      views: { type: 'integer', default: 0 },
    });
    await provider.registerSchema(table, schema);

    try {
      const id = await provider.insertAsync(table, { title: 'Test', views: 5 });
      await provider.updateAsync(table, { _id: id }, { $inc: { views: 3 } });

      const doc = await provider.findOneAsync(table, { _id: id });
      test.equal(doc.views, 8);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - update with $unset', async (test) => {
    const table = `test_uu_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      title: { type: 'text' },
      body:  { type: 'text' },
    });
    await provider.registerSchema(table, schema);

    try {
      const id = await provider.insertAsync(table, { title: 'Test', body: 'Content' });
      await provider.updateAsync(table, { _id: id }, { $unset: { body: 1 } });

      const doc = await provider.findOneAsync(table, { _id: id });
      test.equal(doc.title, 'Test');
      test.isFalse('body' in doc);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - remove', async (test) => {
    const table = `test_rm_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({ title: { type: 'text' } });
    await provider.registerSchema(table, schema);

    try {
      const id = await provider.insertAsync(table, { title: 'Delete me' });
      const removed = await provider.removeAsync(table, { _id: id });
      test.equal(removed, 1);

      const doc = await provider.findOneAsync(table, { _id: id });
      test.isUndefined(doc);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - sort, limit, skip', async (test) => {
    const table = `test_sls_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      title: { type: 'text' },
      order: { type: 'integer' },
    });
    await provider.registerSchema(table, schema);

    try {
      await provider.insertAsync(table, { title: 'C', order: 3 });
      await provider.insertAsync(table, { title: 'A', order: 1 });
      await provider.insertAsync(table, { title: 'B', order: 2 });
      await provider.insertAsync(table, { title: 'D', order: 4 });

      // Sort ascending, skip 1, limit 2
      const results = await provider._fetchResults(table, {}, {
        sort: { order: 1 },
        skip: 1,
        limit: 2,
      });

      test.equal(results.length, 2);
      test.equal(results[0].title, 'B');
      test.equal(results[1].title, 'C');
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - _extra overflow fields', async (test) => {
    const table = `test_ex_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({ title: { type: 'text' } });
    await provider.registerSchema(table, schema);

    try {
      const id = await provider.insertAsync(table, {
        title: 'Test',
        extraString: 'hello',
        extraNumber: 42,
        extraObj: { nested: true },
      });

      const doc = await provider.findOneAsync(table, { _id: id });
      test.equal(doc.title, 'Test');
      test.equal(doc.extraString, 'hello');
      test.equal(doc.extraNumber, 42);
      test.equal(doc.extraObj.nested, true);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - multi-document update', async (test) => {
    const table = `test_mu_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      title: { type: 'text' },
      published: { type: 'boolean', default: false },
    });
    await provider.registerSchema(table, schema);

    try {
      await provider.insertAsync(table, { title: 'A', published: false });
      await provider.insertAsync(table, { title: 'B', published: false });
      await provider.insertAsync(table, { title: 'C', published: true });

      const affected = await provider.updateAsync(
        table,
        { published: false },
        { $set: { published: true } },
        { multi: true }
      );
      test.equal(affected, 2);

      const all = await provider._fetchResults(table, { published: true }, {});
      test.equal(all.length, 3);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - JSONB path queries', async (test) => {
    const table = `test_jp_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      title: { type: 'text' },
      metadata: { type: 'jsonb' },
    });
    await provider.registerSchema(table, schema);

    try {
      await provider.insertAsync(table, {
        title: 'Post 1',
        metadata: { author: 'Alice', rating: 5 },
      });
      await provider.insertAsync(table, {
        title: 'Post 2',
        metadata: { author: 'Bob', rating: 3 },
      });

      const results = await provider._fetchResults(table, { 'metadata.author': 'Alice' }, {});
      test.equal(results.length, 1);
      test.equal(results[0].title, 'Post 1');
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - $type selector treats operand as data', async (test) => {
    const table = `test_ty_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      title: { type: 'text' },
      metadata: { type: 'jsonb' },
    });
    await provider.registerSchema(table, schema);

    try {
      await provider.insertAsync(table, {
        title: 'Object metadata',
        metadata: { author: 'Alice' },
      });
      await provider.insertAsync(table, {
        title: 'String metadata',
        metadata: 'plain text',
      });

      const stringMatches = await provider._fetchResults(table, { metadata: { $type: 'string' } }, {});
      test.equal(stringMatches.length, 1);
      test.equal(stringMatches[0].title, 'String metadata');

      const injectedOperandMatches = await provider._fetchResults(table, {
        metadata: { $type: "string' OR '1'='1" },
      }, {});
      test.equal(injectedOperandMatches.length, 0);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - fetch-modify-write ($push with $each)', async (test) => {
    const table = `test_fmw_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      title: { type: 'text' },
      tags: { type: 'jsonb' },
    });
    await provider.registerSchema(table, schema);

    try {
      const id = await provider.insertAsync(table, { title: 'Test', tags: ['a'] });

      await provider.updateAsync(
        table,
        { _id: id },
        { $push: { tags: { $each: ['b', 'c'] } } }
      );

      const doc = await provider.findOneAsync(table, { _id: id });
      test.equal(doc.tags.length, 3);
      test.equal(doc.tags[0], 'a');
      test.equal(doc.tags[1], 'b');
      test.equal(doc.tags[2], 'c');
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - observeChanges', async (test) => {
    const table = `test_oc_${Random.id(8).toLowerCase()}`;


    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({ title: { type: 'text' } });
    await provider.registerSchema(table, schema);

    try {
      // Insert a doc first
      const id = await provider.insertAsync(table, { title: 'Initial' });

      const added = [];
      const changed = [];
      const removed = [];

      const handle = await provider.observeChanges(
        { collectionName: table, selector: {}, options: {} },
        false, // unordered
        {
          added(id, fields) { added.push({ id, fields }); },
          changed(id, fields) { changed.push({ id, fields }); },
          removed(id) { removed.push(id); },
        }
      );

      // Initial state should have fired added for the existing doc
      test.equal(added.length, 1);
      test.equal(added[0].fields.title, 'Initial');

      // Insert another doc and wait for poll
      const id2 = await provider.insertAsync(table, { title: 'New' });

      // Wait for poll to detect the change
      await new Promise(resolve => setTimeout(resolve, 2000));

      test.isTrue(added.length >= 2);

      handle.stop();
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - AFS provider registration', async (test) => {
    // Verify the provider can be registered with AFS
    // PostgresStreamProvider imported at top of file
    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();

    try {
      AFS.registerProvider('postgres-test', provider);
      const retrieved = AFS.getProvider('postgres-test');
      test.equal(retrieved, provider);
      test.equal(provider.capabilities().reactiveQueries, true);
      test.equal(provider.capabilities().transactions, true);
      test.equal(provider.capabilities().joins, true);
    } finally {
      AFS.removeProvider('postgres-test');
      await provider.close();
    }
  });

  // ==========================================================================
  // C1 — Upsert with non-`_id` selectors must not insert duplicates.
  //
  // Regression: the old buildUpsertQuery generated a fresh Random.id() and
  // built `INSERT ... ON CONFLICT(_id) DO UPDATE`, so a selector like
  // `{ slug: 'foo' }` never conflicted and always inserted a new row.
  // ==========================================================================
  Tinytest.addAsync('postgres - integration - C1 - upsert by _id (existing path)', async (test) => {
    const table = `test_ups_id_${Random.id(8).toLowerCase()}`;
    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      slug: { type: 'text' },
      views: { type: 'integer', default: 0 },
    });
    await provider.registerSchema(table, schema);

    try {
      // First upsert with concrete _id: inserts a row and reports insertedId.
      const first = await provider.upsertAsync(
        table,
        { _id: 'alpha' },
        { $set: { slug: 'first', views: 1 } }
      );
      test.equal(first.numberAffected, 1);
      test.equal(first.insertedId, 'alpha');

      // Second upsert with same _id: updates in place, no insertedId.
      const second = await provider.upsertAsync(
        table,
        { _id: 'alpha' },
        { $set: { slug: 'second', views: 2 } }
      );
      test.equal(second.numberAffected, 1);
      test.isTrue(second.insertedId === undefined || second.insertedId === null);

      // Exactly one row should exist.
      const rows = await provider._fetchResults(table, {}, {});
      test.equal(rows.length, 1);
      test.equal(rows[0]._id, 'alpha');
      test.equal(rows[0].slug, 'second');
      test.equal(rows[0].views, 2);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - C1 - upsert by non-_id selector inserts when missing', async (test) => {
    const table = `test_ups_ins_${Random.id(8).toLowerCase()}`;
    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      slug: { type: 'text' },
      views: { type: 'integer', default: 0 },
    });
    await provider.registerSchema(table, schema);

    try {
      const res = await provider.upsertAsync(
        table,
        { slug: 'foo' },
        { $set: { views: 10 } }
      );
      test.equal(res.numberAffected, 1);
      test.isTrue(typeof res.insertedId === 'string' && res.insertedId.length > 0);

      const rows = await provider._fetchResults(table, {}, {});
      test.equal(rows.length, 1);
      test.equal(rows[0].slug, 'foo');
      test.equal(rows[0].views, 10);
      test.equal(rows[0]._id, res.insertedId);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

  Tinytest.addAsync('postgres - integration - C1 - upsert by non-_id selector updates existing in place (no duplicate)', async (test) => {
    const table = `test_ups_upd_${Random.id(8).toLowerCase()}`;
    const provider = new PostgresStreamProvider(POSTGRES_URL);
    await provider.connect();
    const schema = new ResolvedSchema({
      slug: { type: 'text' },
      views: { type: 'integer', default: 0 },
    });
    await provider.registerSchema(table, schema);

    try {
      // Pre-populate a row that the upsert selector will match.
      const existingId = await provider.insertAsync(table, { slug: 'foo', views: 1 });

      const res = await provider.upsertAsync(
        table,
        { slug: 'foo' },
        { $set: { views: 99 } }
      );
      test.equal(res.numberAffected, 1);
      test.isTrue(res.insertedId === undefined || res.insertedId === null,
        `expected insertedId undefined/null, got ${res.insertedId}`);

      // Regression guard for the duplicate-insert bug: exactly ONE row.
      const rows = await provider._fetchResults(table, {}, {});
      test.equal(rows.length, 1);
      test.equal(rows[0]._id, existingId);
      test.equal(rows[0].slug, 'foo');
      test.equal(rows[0].views, 99);
    } finally {
      await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
      await provider.close();
    }
  });

} else {
  Tinytest.add('postgres - integration - SKIPPED (set POSTGRES_URL to run)', (test) => {
    // Placeholder test when POSTGRES_URL is not set
    test.isTrue(true, 'Integration tests skipped: POSTGRES_URL not set');
  });
}

// ============================================================================
// UNIT TESTS — C3 collection name size limit, C4 reconnect signal,
// I5 swallowed-callback-error event. Appended at the END of the file to
// minimize merge conflict risk with other agents editing this file concurrently.
// ============================================================================

// The 53-byte cap is defined as MAX_COLLECTION_NAME_BYTES in postgres_driver.js.
// Duplicated here as a literal to keep this test block self-contained and
// avoid touching the import list (other agents may be editing it).
const _PG_MAX_COLLECTION_NAME_BYTES = 53;

Tinytest.addAsync(
  'postgres - driver - C3 - setupListenNotify rejects >53 byte collection name',
  async (test) => {
    const conn = new PostgresConnection('postgres://example');
    conn._notifyCallbacks = new Map();
    const tooLong = 'a'.repeat(_PG_MAX_COLLECTION_NAME_BYTES + 1);

    conn.getClient = async () => {
      throw new Error('should not reach getClient');
    };
    conn._ensureListenClient = async () => {
      throw new Error('should not reach _ensureListenClient');
    };

    await test.throwsAsync(async () => {
      await conn.setupListenNotify(tooLong, () => {});
    }, /collection name/);
  }
);

Tinytest.addAsync(
  'postgres - driver - C3 - ensureTable rejects >53 byte collection name',
  async (test) => {
    const conn = new PostgresConnection('postgres://example');
    conn.query = async () => {
      throw new Error('should not reach query');
    };

    await test.throwsAsync(async () => {
      await conn.ensureTable('b'.repeat(_PG_MAX_COLLECTION_NAME_BYTES + 1), null);
    }, /collection name/);
  }
);

Tinytest.addAsync(
  'postgres - driver - C3 - setupListenNotify accepts exactly 53 byte collection name',
  async (test) => {
    const conn = new PostgresConnection('postgres://example');
    conn._notifyCallbacks = new Map();
    const okName = 'c'.repeat(_PG_MAX_COLLECTION_NAME_BYTES);

    conn.getClient = async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release() {},
    });
    conn._ensureListenClient = async () => {
      conn._listenClient = {
        on() {},
        query: async () => ({ rows: [], rowCount: 0 }),
      };
      conn._attachListenClientHandlers(conn._listenClient);
    };

    await conn.setupListenNotify(okName, () => {});
    test.equal(conn._notifyCallbacks.size, 1);
    test.isTrue(conn._notifyCallbacks.has(`meteor_pg_${okName}`));
  }
);

Tinytest.addAsync(
  'postgres - driver - I5 - callback errors emit listen:callback-error',
  async (test) => {
    const conn = new PostgresConnection('postgres://example');
    conn._notifyCallbacks = new Map();
    const collectionName = 'cbfail';
    const channel = `meteor_pg_${collectionName}`;

    conn.getClient = async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release() {},
    });

    // Capture the notification handler attached by _attachListenClientHandlers
    // so we can invoke it directly instead of needing a live pg client.
    let notificationHandler = null;
    conn._ensureListenClient = async () => {
      conn._listenClient = {
        on: (event, handler) => {
          if (event === 'notification') notificationHandler = handler;
        },
        query: async () => ({ rows: [], rowCount: 0 }),
      };
      conn._attachListenClientHandlers(conn._listenClient);
    };

    const thrown = new Error('callback boom');
    const callback = () => {
      throw thrown;
    };

    const events = [];
    conn.on('listen:callback-error', (info) => {
      events.push(info);
    });

    await conn.setupListenNotify(collectionName, callback);

    test.isTrue(typeof notificationHandler === 'function', 'notification handler attached');

    notificationHandler({
      channel,
      payload: JSON.stringify({ op: 'INSERT', id: 'row1' }),
    });

    test.equal(events.length, 1, 'one listen:callback-error event fired');
    test.equal(events[0].channel, channel);
    test.equal(events[0].error, thrown);
    test.equal(events[0].payload.op, 'INSERT');
    test.equal(events[0].payload.id, 'row1');
  }
);

Tinytest.addAsync(
  'postgres - driver - C4 - _reconnectListenClient re-LISTENs and emits listen:reconnected with channels',
  async (test) => {
    const conn = new PostgresConnection('postgres://example');
    conn._connected = true;
    conn._listenClient = null;
    conn._notifyCallbacks = new Map();
    conn._notifyCallbacks.set('meteor_pg_colA', new Set([() => {}]));
    conn._notifyCallbacks.set('meteor_pg_colB', new Set([() => {}]));

    const listenQueries = [];
    conn._pool = {
      connect: async () => ({
        on() {},
        query: async (text) => {
          listenQueries.push(text);
          return { rows: [], rowCount: 0 };
        },
      }),
    };
    // No-op real handler attach; we only need the replay+emit path.
    conn._attachListenClientHandlers = () => {};

    const events = [];
    conn.on('listen:reconnected', (info) => events.push(info));

    await conn._reconnectListenClient();

    test.equal(listenQueries.length, 2, 'each channel re-LISTENed');
    test.isTrue(listenQueries[0].startsWith('LISTEN '));
    test.equal(events.length, 1, 'listen:reconnected fired once');
    test.isTrue(Array.isArray(events[0].channels), 'channels payload is an array');
    test.equal(events[0].channels.length, 2);
    test.isTrue(events[0].channels.includes('meteor_pg_colA'));
    test.isTrue(events[0].channels.includes('meteor_pg_colB'));
  }
);

// C4 observe-side end-to-end — observe driver reacts to reconnect event.
// Integration test: kills the LISTEN backend via pg_terminate_backend,
// awaits reconnect, inserts a row during the "gap", and verifies the
// observer surfaces the new row via the catch-up poll.
if (hasPostgres) {
  Tinytest.addAsync(
    'postgres - observe_driver - C4 - reconnect triggers reset + catch-up poll',
    async (test) => {
      const table = `test_rc_${Random.id(8).toLowerCase()}`;
      const provider = new PostgresStreamProvider(POSTGRES_URL);
      await provider.connect();
      const schema = new ResolvedSchema({ title: { type: 'text' } });
      await provider.registerSchema(table, schema);

      try {
        await provider.insertAsync(table, { _id: 'r1', title: 'before' });

        const driver = provider._connection;
        const events = [];
        driver.on('listen:reconnected', (info) => events.push({ type: 'reconnected', info }));
        driver.on('listen:gave-up', (info) => events.push({ type: 'gave-up', info }));

        const added = [];
        const handle = await provider.observeChanges(
          { collectionName: table, selector: {}, options: { sort: { _id: 1 } } },
          false,
          {
            added(id, fields) { added.push({ id, fields }); },
            changed() {},
            removed() {},
          }
        );

        // Wait for initial snapshot to settle.
        await new Promise((r) => setTimeout(r, 300));
        test.equal(added.length, 1, 'initial snapshot saw the pre-existing row');

        // Grab the LISTEN backend PID via the listen client itself.
        const pidRow = await driver._listenClient.query('SELECT pg_backend_pid() AS pid');
        const listenPid = pidRow.rows[0].pid;

        // From a separate pool connection, kill the LISTEN backend.
        await driver.query('SELECT pg_terminate_backend($1)', [listenPid]);

        // Wait for reconnect (bounded).
        const reconnectStart = Date.now();
        while (events.length === 0 && Date.now() - reconnectStart < 10000) {
          await new Promise((r) => setTimeout(r, 100));
        }
        test.isTrue(events.some((e) => e.type === 'reconnected'),
          'driver emitted listen:reconnected within 10s');

        // Insert a row while the observer is reconciling.
        await provider.insertAsync(table, { _id: 'r2', title: 'after' });

        // Wait for the catch-up poll to deliver the new row.
        const pollStart = Date.now();
        while (added.length < 2 && Date.now() - pollStart < 5000) {
          await new Promise((r) => setTimeout(r, 100));
        }

        test.equal(added.length, 2, 'observer saw both rows (no rows lost)');
        const addedIds = added.map((a) => a.id).sort();
        test.equal(addedIds, ['r1', 'r2'], 'no duplicated ids');

        handle.stop();
      } finally {
        await provider._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
        await provider.close();
      }
    }
  );
}

// ============================================================================
// REGRESSION TESTS — Security & Correctness Fixes
// ============================================================================
//
// Each test below locks in a specific Critical/Important fix from the
// packages/postgres senior review so the failure mode can never silently
// reappear. Tests are grouped by the file/concern they exercise.
// ============================================================================

// ---------------------------------------------------------------------------
// Prototype-pollution guard — unsafe keys must be rejected everywhere a
// user-supplied string becomes a SQL identifier or JSONB path.
// ---------------------------------------------------------------------------

Tinytest.add('postgres - regression - proto-pollution guard rejects __proto__ in selector top-level key', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileSelector({ __proto__: { x: 1 } }, schema);
  }, /unsafe field path/);
});

Tinytest.add('postgres - regression - proto-pollution guard rejects constructor in dotted selector key', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileSelector({ 'metadata.constructor.polluted': 'x' }, schema);
  }, /unsafe field path/);
});

Tinytest.add('postgres - regression - proto-pollution guard rejects prototype segment in sort', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileSort({ 'metadata.prototype': 1 }, schema);
  }, /unsafe field path/);
});

Tinytest.add('postgres - regression - proto-pollution guard rejects __proto__ in $set modifier', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileModifier({ $set: { '__proto__.polluted': true } }, schema);
  }, /unsafe field path/);
});

// ---------------------------------------------------------------------------
// PCRE→POSIX regex guard — reject constructs Postgres POSIX ERE does not
// support instead of silently running a different regex than the caller
// wrote.
// ---------------------------------------------------------------------------

Tinytest.add('postgres - regression - $regex rejects inline PCRE flags like (?i)', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileSelector({ title: { $regex: '(?i)hello' } }, schema);
  }, /PCRE construct/);
});

Tinytest.add('postgres - regression - $regex rejects lookaheads', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileSelector({ title: { $regex: 'foo(?=bar)' } }, schema);
  }, /PCRE construct/);
});

Tinytest.add('postgres - regression - $regex rejects negative lookbehinds', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileSelector({ title: { $regex: '(?<!foo)bar' } }, schema);
  }, /PCRE construct/);
});

Tinytest.add('postgres - regression - $regex rejects \\d shorthand', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileSelector({ title: { $regex: '\\d+' } }, schema);
  }, /PCRE construct/);
});

Tinytest.add('postgres - regression - $regex allows escaped backslash followed by d (\\\\d is literal)', (test) => {
  const schema = createTestSchema();
  // `\\d` in a pattern is a literal backslash followed by `d`, not a
  // shorthand class. Should NOT trip the guard.
  const result = compileSelector({ title: { $regex: '\\\\d' } }, schema);
  test.isTrue(result.text.length > 0);
});

Tinytest.add('postgres - regression - $not with PCRE regex is rejected', (test) => {
  const schema = createTestSchema();
  test.throws(() => {
    compileSelector({ title: { $not: /foo(?=bar)/ } }, schema);
  }, /PCRE construct/);
});

// ---------------------------------------------------------------------------
// $options merging — Mongo allows `{ $regex: '...', $options: 'i' }` as a
// sibling pair; flags from $options must be folded into RegExp flags.
// ---------------------------------------------------------------------------

Tinytest.add('postgres - regression - $options "i" folded into $regex string makes case-insensitive operator', (test) => {
  const schema = createTestSchema();
  const result = compileSelector({ title: { $regex: 'hello', $options: 'i' } }, schema);
  test.isTrue(result.text.includes('~*'), 'case-insensitive regex operator ~* selected');
});

Tinytest.add('postgres - regression - $options "i" folded when $regex is a RegExp without i flag', (test) => {
  const schema = createTestSchema();
  const result = compileSelector({ title: { $regex: /hello/, $options: 'i' } }, schema);
  test.isTrue(result.text.includes('~*'), 'flags union yields case-insensitive');
});

// ---------------------------------------------------------------------------
// $push on scalar / $elemMatch null / schema finite-default
// ---------------------------------------------------------------------------

Tinytest.add('postgres - regression - $push on non-array value throws', (test) => {
  const schema = createTestSchema();
  // `title` is a text column, not an array. $push must not silently coerce.
  test.throws(() => {
    compileModifier({ $push: { title: 'x' } }, schema);
  });
});

Tinytest.add('postgres - regression - $elemMatch with null does not throw and produces valid SQL', (test) => {
  const schema = createTestSchema();
  const result = compileSelector({ tags: { $elemMatch: null } }, schema);
  test.isTrue(typeof result.text === 'string' && result.text.length > 0);
});

Tinytest.add('postgres - regression - schema rejects non-finite number default (NaN)', (test) => {
  const schema = new ResolvedSchema({
    bad: { type: 'integer', default: NaN },
  });
  test.throws(() => schema.getColumnDefinitions(), /finite number/);
});

Tinytest.add('postgres - regression - schema rejects non-finite number default (Infinity)', (test) => {
  const schema = new ResolvedSchema({
    bad: { type: 'numeric', default: Infinity },
  });
  test.throws(() => schema.getColumnDefinitions(), /finite number/);
});

// ---------------------------------------------------------------------------
// ORDER BY in LIMIT-1 UPDATE subqueries — non-multi update must pick a
// deterministic row when a selector matches >1 row plus options.sort.
// ---------------------------------------------------------------------------

Tinytest.add('postgres - regression - non-multi update with sort emits ORDER BY inside LIMIT 1 subquery', (test) => {
  const schema = createTestSchema();
  const { text } = buildUpdateQuery(
    'T',
    { published: true },
    { $set: { title: 'x' } },
    { multi: false, sort: { views: -1 } },
    schema
  );
  // The subquery that picks the single target row must carry ORDER BY so
  // "update oldest/newest/highest" is deterministic. Without it, Postgres
  // returns an implementation-defined row.
  test.isTrue(/ORDER BY/.test(text), 'UPDATE subquery includes ORDER BY');
  test.isTrue(/LIMIT 1/.test(text), 'UPDATE subquery limited to one row');
});

// ---------------------------------------------------------------------------
// Observe-driver polling interval clamp — a misconfigured interval must not
// melt the database with sub-millisecond polling.
// ---------------------------------------------------------------------------

Tinytest.add('postgres - regression - observe_driver POLLING_INTERVAL_MS clamped to >= 100ms', (test) => {
  // The constant is evaluated once at module load. Whatever it was parsed
  // from, it must have been clamped up to the 100ms floor.
  test.isTrue(typeof POLLING_INTERVAL_MS === 'number');
  test.isTrue(POLLING_INTERVAL_MS >= 100, `interval ${POLLING_INTERVAL_MS} >= 100ms floor`);
});

// ---------------------------------------------------------------------------
// Server startup-failure latch — Postgres.Collection / Postgres._query must
// surface the latched error instead of silently no-oping.
// ---------------------------------------------------------------------------

Tinytest.add('postgres - regression - _query throws latched startup error', (test) => {
  const latched = new Error('simulated startup failure');
  Postgres._testSetConnectFailed(latched);
  try {
    test.throws(() => Postgres._query('SELECT 1'), /Postgres connection failed at startup/);
  } finally {
    Postgres._testSetConnectFailed(null);
  }
});

Tinytest.add('postgres - regression - Collection constructor throws latched startup error', (test) => {
  const latched = new Error('simulated startup failure');
  Postgres._testSetConnectFailed(latched);
  try {
    test.throws(() => new Postgres.Collection('t'), /Postgres connection failed at startup/);
  } finally {
    Postgres._testSetConnectFailed(null);
  }
});

