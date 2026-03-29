// packages/mongo-schema/schema_jsonschema.js

/**
 * @module mongo-schema/schema_jsonschema
 * @summary Compiles a schema IR into a MongoDB `$jsonSchema` document suitable
 * for use with `db.createCollection()` or `collMod` validator rules. The output
 * uses BSON types and MongoDB-specific extensions (e.g., `bsonType` instead of `type`).
 */

/**
 * @typedef {Object} JsonSchema
 * @property {string} bsonType - Always `'object'` at the root level.
 * @property {string[]} [required] - Names of required top-level properties.
 * @property {Object<string, JsonSchemaField>} [properties] - Per-field schema definitions.
 */

/**
 * @typedef {Object} JsonSchemaField
 * @property {string|string[]} [bsonType] - The BSON type(s) for this field.
 * @property {JsonSchemaField[]} [oneOf] - For union types, an array of type alternatives.
 * @property {string[]} [required] - Required child properties (for nested objects).
 * @property {Object<string, JsonSchemaField>} [properties] - Child property schemas (for nested objects).
 * @property {JsonSchemaField} [items] - Item schema (for arrays).
 * @property {number} [minimum] - Minimum numeric value.
 * @property {number} [maximum] - Maximum numeric value.
 * @property {boolean} [exclusiveMinimum] - Whether `minimum` is exclusive.
 * @property {boolean} [exclusiveMaximum] - Whether `maximum` is exclusive.
 * @property {number} [minLength] - Minimum string length.
 * @property {number} [maxLength] - Maximum string length.
 * @property {Array} [enum] - Allowed values whitelist.
 * @property {string} [pattern] - Regular expression pattern for strings.
 * @property {number} [minItems] - Minimum array length.
 * @property {number} [maxItems] - Maximum array length.
 */

/**
 * Compile a schema IR into a MongoDB `$jsonSchema` validator document.
 *
 * Only top-level fields are emitted at the root; nested fields are compiled
 * recursively into `properties` of their parent object. Fields typed as
 * `MongoSchema.Any` or custom constructors (with `bsonType: null`) are excluded.
 *
 * @param {Map<string, import('./schema_definition.js').FieldDescriptor>} ir - The schema IR.
 * @returns {JsonSchema} A MongoDB `$jsonSchema`-compatible object.
 *
 * @example
 * const schema = new MongoSchema({
 *   name: { type: String, min: 1 },
 *   age: { type: MongoSchema.Integer, min: 0, max: 150 },
 *   tags: [String],
 * });
 *
 * const jsonSchema = schema.toJsonSchema();
 * // {
 * //   bsonType: 'object',
 * //   required: ['name', 'age', 'tags'],
 * //   properties: {
 * //     name: { bsonType: 'string', minLength: 1 },
 * //     age: { bsonType: ['int', 'long'], minimum: 0, maximum: 150 },
 * //     tags: { bsonType: 'array', items: { bsonType: 'string' } }
 * //   }
 * // }
 *
 * // Apply to a MongoDB collection:
 * await db.command({
 *   collMod: 'users',
 *   validator: { $jsonSchema: jsonSchema },
 *   validationLevel: 'moderate',
 * });
 */
export function compileToJsonSchema(ir) {
  const required = [];
  const properties = {};

  for (const [key, desc] of ir) {
    if (key.includes('.')) continue; // Nested handled via recursion
    properties[key] = compileField(ir, key, desc);
    if (desc.required && key !== '_id') {
      required.push(key);
    }
  }

  const schema = { bsonType: 'object' };
  if (required.length > 0) schema.required = required;
  if (Object.keys(properties).length > 0) schema.properties = properties;
  return schema;
}

/**
 * Compile a single field descriptor into a `$jsonSchema` field definition.
 * Recursively processes children (for objects) and items (for arrays).
 *
 * @param {Map<string, import('./schema_definition.js').FieldDescriptor>} ir - Schema IR.
 * @param {string} key - The dot-path key of the field being compiled.
 * @param {import('./schema_definition.js').FieldDescriptor} desc - The field's descriptor.
 * @returns {JsonSchemaField} The compiled JSON Schema field definition.
 */
function compileField(ir, key, desc) {
  const result = {};
  const typeName = desc.resolvedType.name;

  // Handle oneOf
  if (typeName === 'oneOf') {
    const oneOfEntries = [];
    for (const rt of desc.resolvedType.resolvedTypes) {
      if (rt.bsonType) {
        oneOfEntries.push({ bsonType: rt.bsonType });
      } else {
        // Types without bsonType (Any, custom constructors) produce an unconstrained
        // entry — effectively making the entire oneOf permissive. Warn in development.
        if (typeof Meteor !== 'undefined' && Meteor.isDevelopment) {
          console.warn(
            `MongoSchema: oneOf includes type "${rt.name}" which has no bsonType and ` +
            `cannot be represented in $jsonSchema. The compiled oneOf constraint for ` +
            `field "${key}" will include an unconstrained entry.`
          );
        }
        oneOfEntries.push({});
      }
    }
    result.oneOf = oneOfEntries;
    return result;
  }

  // bsonType
  if (desc.resolvedType.bsonType) {
    result.bsonType = desc.resolvedType.bsonType;
  }

  // Nested object
  if ((typeName === 'object' || typeName === 'schema') && desc.children && desc.children.length > 0 && !desc.blackbox) {
    const childRequired = [];
    const childProperties = {};
    for (const childKey of desc.children) {
      const childDesc = ir.get(childKey);
      const localKey = childKey.slice(key.length + 1);
      childProperties[localKey] = compileField(ir, childKey, childDesc);
      if (childDesc.required) childRequired.push(localKey);
    }
    if (childRequired.length > 0) result.required = childRequired;
    if (Object.keys(childProperties).length > 0) result.properties = childProperties;
  }

  // Array items
  if (typeName === 'array' && desc.itemKey) {
    const itemDesc = ir.get(desc.itemKey);
    result.items = compileField(ir, desc.itemKey, itemDesc);
  }

  // Constraints
  if (typeof desc.min === 'number' && typeName !== 'array') {
    if (typeName === 'string') {
      result.minLength = desc.min;
    } else {
      result.minimum = desc.min;
      if (desc.exclusiveMin) result.exclusiveMinimum = true;
    }
  }
  if (typeof desc.max === 'number' && typeName !== 'array') {
    if (typeName === 'string') {
      result.maxLength = desc.max;
    } else {
      result.maximum = desc.max;
      if (desc.exclusiveMax) result.exclusiveMaximum = true;
    }
  }
  if (desc.allowedValues) result.enum = desc.allowedValues;
  if (desc.regEx) {
    // MongoDB $jsonSchema only supports a single pattern. Use first if array.
    const re = Array.isArray(desc.regEx) ? desc.regEx[0] : desc.regEx;
    if (re instanceof RegExp) {
      if (re.flags !== '' && typeof Meteor !== 'undefined' && Meteor.isDevelopment) {
        console.warn(
          `MongoSchema: RegExp for field "${key}" has flags "${re.flags}" ` +
          `but MongoDB $jsonSchema "pattern" does not support regex flags. ` +
          `Flags will be ignored for pattern: ${re.source}`
        );
      }
      result.pattern = re.source;
    }
  }
  if (desc.minCount !== undefined) result.minItems = desc.minCount;
  if (desc.maxCount !== undefined) result.maxItems = desc.maxCount;

  return result;
}
