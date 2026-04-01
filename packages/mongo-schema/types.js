// packages/mongo-schema/types.js

/**
 * @module mongo-schema/types
 * @summary Core type system for MongoSchema. Provides built-in type markers,
 * union types via `oneOf`, and a resolver that maps field definitions to
 * runtime type descriptors used by validation, cleaning, and JSON Schema compilation.
 */

/**
 * @typedef {Object} TypeDescriptor
 * @property {string} name - Human-readable type name (e.g., `'string'`, `'number'`, `'oneOf'`, `'schema'`).
 * @property {Function} check - Returns `true` if `value` matches this type.
 * @property {string|string[]|null} [bsonType] - BSON type(s) for `$jsonSchema` compilation.
 *   `null` means the type is excluded from database-level schemas (e.g., `Any`, custom constructors).
 * @property {TypeDescriptor[]} [resolvedTypes] - Present only for `oneOf` unions; the resolved
 *   descriptors of each constituent type.
 * @property {MongoSchema} [schema] - Present only when a `MongoSchema` instance is used as a
 *   sub-schema type for nested object validation.
 */

/**
 * Sentinel marker representing an integer type (no fractional part).
 * Use as `MongoSchema.Integer` in field definitions.
 *
 * @example
 * const schema = new MongoSchema({ age: MongoSchema.Integer });
 *
 * @type {{ _type: 'MongoSchema.Integer' }}
 */
const IntegerMarker = { _type: 'MongoSchema.Integer' };

/**
 * Sentinel marker representing any type — always passes validation.
 * Fields typed as `Any` are excluded from `$jsonSchema` compilation.
 * Use as `MongoSchema.Any` in field definitions.
 *
 * @example
 * const schema = new MongoSchema({ metadata: MongoSchema.Any });
 *
 * @type {{ _type: 'MongoSchema.Any' }}
 */
const AnyMarker = { _type: 'MongoSchema.Any' };

/**
 * Creates a union type that accepts any of the provided types.
 * During validation, a value passes if it satisfies **at least one** of the constituent types.
 *
 * @param {...(Function|Object)} typeDefs - Two or more type definitions (e.g., `String`, `Number`,
 *   `MongoSchema.Integer`, or a `MongoSchema` instance).
 * @returns {{ _isOneOf: true, types: Array }} A union marker consumed by {@link resolveType}.
 *
 * @example
 * const schema = new MongoSchema({
 *   value: { type: MongoSchema.oneOf(String, Number) }
 * });
 */
function oneOf(...typeDefs) {
  return {
    _isOneOf: true,
    types: typeDefs,
  };
}

/**
 * Check whether a value is a plain object (object literal or `Object.create(null/Object.prototype)`).
 * Returns `false` for instances of built-in classes like `RegExp`, `Error`, `Map`, `Set`, etc.
 *
 * @param {*} v - Value to check.
 * @returns {boolean} `true` if `v` is a plain object.
 */
function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Maps built-in JavaScript constructors and sentinel markers to their
 * {@link TypeDescriptor}s. Used internally by {@link resolveType}.
 *
 * Registered types: `String`, `Number`, `Boolean`, `Date`, `Object`, `Array`,
 * `IntegerMarker`, `AnyMarker`.
 *
 * @type {Object}
 */
const TYPE_MAP = new Map();

TYPE_MAP.set(String, {
  name: 'string',
  check: (v) => typeof v === 'string',
  bsonType: 'string',
});

TYPE_MAP.set(Number, {
  name: 'number',
  check: (v) => typeof v === 'number' && !isNaN(v),
  bsonType: ['double', 'int', 'long', 'decimal'],
});

TYPE_MAP.set(Boolean, {
  name: 'boolean',
  check: (v) => typeof v === 'boolean',
  bsonType: 'bool',
});

TYPE_MAP.set(Date, {
  name: 'date',
  check: (v) => v instanceof Date && !isNaN(v.getTime()),
  bsonType: 'date',
});

TYPE_MAP.set(Object, {
  name: 'object',
  check: isPlainObject,
  bsonType: 'object',
});

TYPE_MAP.set(Array, {
  name: 'array',
  check: (v) => Array.isArray(v),
  bsonType: 'array',
});

TYPE_MAP.set(IntegerMarker, {
  name: 'integer',
  check: (v) => typeof v === 'number' && !isNaN(v) && Number.isInteger(v),
  bsonType: ['int', 'long'],
});

TYPE_MAP.set(AnyMarker, {
  name: 'any',
  check: () => true,
  bsonType: null, // Not compiled to $jsonSchema
});

/**
 * Resolves a user-provided type definition into a {@link TypeDescriptor}.
 *
 * Supports:
 * - **Built-in constructors**: `String`, `Number`, `Boolean`, `Date`, `Object`, `Array`
 * - **Sentinel markers**: `MongoSchema.Integer`, `MongoSchema.Any`
 * - **Union types**: objects created by {@link oneOf}
 * - **Sub-schemas**: `MongoSchema` instances used as nested object types
 * - **Custom constructors**: any function — validated via `instanceof`
 *
 * @param {Function|Object} typeDef - A type definition from a schema field's `type` property.
 * @returns {TypeDescriptor} The resolved descriptor with `name`, `check`, and optionally `bsonType`.
 * @throws {Error} If `typeDef` is not a recognized type.
 *
 * @example
 * resolveType(String);
 * // => { name: 'string', check: [Function], bsonType: 'string' }
 *
 * resolveType(MongoSchema.Integer);
 * // => { name: 'integer', check: [Function], bsonType: ['int', 'long'] }
 */
function resolveType(typeDef) {
  // Check direct map
  if (TYPE_MAP.has(typeDef)) {
    return TYPE_MAP.get(typeDef);
  }

  // oneOf union
  if (typeDef && typeDef._isOneOf) {
    const resolvedTypes = typeDef.types.map(t => resolveType(t));
    return {
      name: 'oneOf',
      check: (v) => resolvedTypes.some(rt => rt.check(v)),
      resolvedTypes,
    };
  }

  // MongoSchema instance used as subschema
  if (typeDef && typeDef._isMongoSchema) {
    return {
      name: 'schema',
      check: isPlainObject,
      schema: typeDef,
    };
  }

  // Custom constructor
  if (typeof typeDef === 'function') {
    return {
      name: typeDef.name || 'custom',
      check: (v) => v instanceof typeDef,
      bsonType: null,
    };
  }

  throw new Error(`MongoSchema: Unknown type: ${typeDef}`);
}

export { IntegerMarker, AnyMarker, oneOf, resolveType, TYPE_MAP, isPlainObject };
