// packages/mongo-schema/types.js

// Sentinel markers
const IntegerMarker = { _type: 'MongoSchema.Integer' };
const AnyMarker = { _type: 'MongoSchema.Any' };

function oneOf(...typeDefs) {
  return {
    _isOneOf: true,
    types: typeDefs,
  };
}

// Type descriptors returned by resolveType
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
  check: (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date),
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
      check: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
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

export { IntegerMarker, AnyMarker, oneOf, resolveType, TYPE_MAP };
