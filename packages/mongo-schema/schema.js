// packages/mongo-schema/schema.js

/**
 * @module mongo-schema/schema
 * @summary The main `MongoSchema` class — a declarative schema definition and
 * validation system for MongoDB documents. Provides cleaning (type coercion,
 * filtering, defaults), validation (required, type, constraints, custom),
 * JSON Schema compilation for database-level enforcement, and reactive
 * validation contexts for UI integration.
 */

import { IntegerMarker, AnyMarker, oneOf } from './types.js';
import { ErrorTypes } from './schema_errors.js';
import { parseDefinition, normalizeFieldDef } from './schema_definition.js';
import { clean as cleanDoc } from './schema_clean.js';
import { validate as validateDoc } from './schema_validate.js';
import { ValidationContext } from './schema_context.js';
import { compileToJsonSchema } from './schema_jsonschema.js';

/**
 * @typedef {Object} MongoSchemaOptions
 * @property {boolean} [requiredByDefault=true] - Whether fields without explicit
 *   `optional`/`required` are required. The `_id` field is always optional regardless.
 * @property {boolean} [humanizeAutoLabels=true] - Auto-generate human-readable labels
 *   from field keys (e.g., `'createdAt'` → `'Created at'`).
 * @property {Object} [clean] - Default cleaning options applied by `clean()`.
 * @property {boolean} [clean.filter=true] - Remove keys not in the schema.
 * @property {boolean} [clean.autoConvert=true] - Auto-convert types (e.g., `"42"` → `42`).
 * @property {boolean} [clean.removeEmptyStrings=true] - Delete fields with `""` values.
 * @property {boolean} [clean.trimStrings=true] - Trim whitespace from strings.
 * @property {boolean} [clean.getAutoValues=true] - Apply `defaultValue` and `autoValue`.
 */

/**
 * @summary Constructor for a MongoSchema — a declarative schema definition for MongoDB documents.
 * @locus Anywhere
 * @class
 * @instancename schema
 * @param {Object} definition Schema definition mapping field paths to field definitions. Supports shorthand syntax (bare constructors like `String`, arrays like `[String]`, RegExp) and full definition objects with `type`, constraints, and options.
 * @param {Object} [options] Schema-level options.
 * @param {Boolean} [options.requiredByDefault=true] Whether fields without explicit `optional`/`required` are required.
 * @param {Boolean} [options.humanizeAutoLabels=true] Auto-generate human-readable labels from field keys.
 * @param {Object} [options.clean] Default cleaning options applied by `clean()`.
 * @param {Boolean} [options.clean.filter=true] Remove keys not in the schema.
 * @param {Boolean} [options.clean.autoConvert=true] Auto-convert types (e.g., `"42"` → `42`).
 * @param {Boolean} [options.clean.removeEmptyStrings=true] Delete fields with `""` values.
 * @param {Boolean} [options.clean.trimStrings=true] Trim whitespace from strings.
 * @param {Boolean} [options.clean.getAutoValues=true] Apply `defaultValue` and `autoValue`.
 */
export class MongoSchema {
  /**
   * @private
   */
  constructor(definition, options = {}) {
    /** @type {true} */
    this._isMongoSchema = true;
    /** @private */
    this._definition = definition;
    /**
     * @type {Object}
     * @private
     */
    this._options = {
      requiredByDefault: true,
      humanizeAutoLabels: true,
      clean: {
        filter: true,
        autoConvert: true,
        removeEmptyStrings: true,
        trimStrings: true,
        getAutoValues: true,
      },
      ...options,
    };
    if (options.clean) {
      this._options.clean = { ...this._options.clean, ...options.clean };
    }
    /**
     * Parsed intermediate representation — a `Map<string, FieldDescriptor>`.
     * @type {Object}
     * @private
     */
    this._ir = parseDefinition(definition, this._options);

    // Validator registries
    /**
     * @type {Array}
     * @private
     */
    this._validators = [];
    /**
     * @type {Array}
     * @private
     */
    this._docValidators = [];
  }

  /**
   * @summary Create a new schema by merging this schema's definition with another. Fields from `otherSchema` override same-named fields in this schema.
   * @locus Anywhere
   * @method extend
   * @memberof MongoSchema
   * @instance
   * @param {MongoSchema} otherSchema Schema whose fields are merged in.
   * @returns {MongoSchema} A new schema with the combined definitions.
   */
  extend(otherSchema) {
    const mergedDef = { ...this._definition, ...otherSchema._definition };
    const mergedOpts = { ...this._options, ...otherSchema._options };
    if (this._options.clean || otherSchema._options.clean) {
      mergedOpts.clean = {
        ...(this._options.clean || {}),
        ...(otherSchema._options.clean || {}),
      };
    }
    return new MongoSchema(mergedDef, mergedOpts);
  }

  /**
   * @summary Create a new schema containing only the specified top-level keys. Nested fields under a picked key are included automatically.
   * @locus Anywhere
   * @method pick
   * @memberof MongoSchema
   * @instance
   * @param {...String} keys Top-level field names to keep.
   * @returns {MongoSchema} A new schema with only the selected fields.
   */
  pick(...keys) {
    const pickedDef = {};
    const keySet = new Set(keys);
    for (const [k, v] of Object.entries(this._definition)) {
      const topKey = k.split('.')[0];
      if (keySet.has(topKey) || keySet.has(k)) {
        pickedDef[k] = v;
      }
    }
    return new MongoSchema(pickedDef, this._options);
  }

  /**
   * @summary Create a new schema excluding the specified top-level keys. Nested fields under an omitted key are excluded automatically.
   * @locus Anywhere
   * @method omit
   * @memberof MongoSchema
   * @instance
   * @param {...String} keys Top-level field names to exclude.
   * @returns {MongoSchema} A new schema without the specified fields.
   */
  omit(...keys) {
    const keySet = new Set(keys);
    const omittedDef = {};
    for (const [k, v] of Object.entries(this._definition)) {
      const topKey = k.split('.')[0];
      if (!keySet.has(topKey) && !keySet.has(k)) {
        omittedDef[k] = v;
      }
    }
    return new MongoSchema(omittedDef, this._options);
  }

  /**
   * @summary Clean a document or modifier by applying the cleaning pipeline: filter unknown keys, auto-convert types, trim strings, remove empty strings, and apply default/auto values.
   * @locus Anywhere
   * @method clean
   * @memberof MongoSchema
   * @instance
   * @param {Object} doc The document or modifier to clean.
   * @param {Object} [options] Override cleaning options. Merged with the schema's default clean options.
   * @param {Boolean} [options.mutate=false] If `true`, mutates the input document in place instead of cloning.
   * @param {Boolean} [options.filter] Remove keys not defined in the schema.
   * @param {Boolean} [options.autoConvert] Attempt automatic type conversion.
   * @param {Boolean} [options.removeEmptyStrings] Delete fields with `""` values.
   * @param {Boolean} [options.trimStrings] Trim whitespace from strings.
   * @param {Boolean} [options.getAutoValues] Apply `defaultValue` and `autoValue` functions.
   * @param {Boolean} [options.isModifier=false] Treat the document as a MongoDB update modifier.
   * @returns {Object} The cleaned document.
   */
  clean(doc, options = {}) {
    const cleanOpts = {
      mutate: false,
      ...this._options.clean,
      ...options,
    };
    return cleanDoc(this._ir, doc, cleanOpts);
  }

  /**
   * @summary Extract a sub-schema for a nested object field. Returns a new `MongoSchema` containing only the child fields under the given key.
   * @locus Anywhere
   * @method getObjectSchema
   * @memberof MongoSchema
   * @instance
   * @param {String} key The parent field path (e.g., `'address'`).
   * @returns {MongoSchema} A new schema for the nested object's fields.
   */
  getObjectSchema(key) {
    const prefix = key + '.';
    const subDef = {};
    for (const [k, v] of Object.entries(this._definition)) {
      if (k.startsWith(prefix)) {
        subDef[k.slice(prefix.length)] = v;
      }
    }
    return new MongoSchema(subDef, this._options);
  }

  /**
   * @summary Validate a document against this schema. Throws a `ValidationError` if any fields fail validation.
   * @locus Anywhere
   * @method validate
   * @memberof MongoSchema
   * @instance
   * @param {Object} doc The document or modifier to validate.
   * @param {Object} [options] Validation options.
   * @param {Boolean} [options.modifier=false] Treat the document as a MongoDB update modifier.
   * @param {Array} [options.keys] Only validate these specific field paths.
   * @param {Array} [options.ignore] Error types to exclude from the result.
   * @param {Boolean} [options.isInsert] Set to `true` for insert validation (enables `denyInsert` checks).
   * @param {Boolean} [options.isUpdate] Set to `true` for update validation (enables `denyUpdate` checks).
   */
  validate(doc, options = {}) {
    validateDoc(this._ir, doc, {
      ...options,
      _schema: this,
      _validators: this._validators,
      _docValidators: this._docValidators,
      _globalValidators: MongoSchema._globalValidators,
      _globalDocValidators: MongoSchema._globalDocValidators,
    });
  }

  /**
   * @summary Create a new, unnamed validation context. Validation contexts collect errors without throwing and support reactive error display in forms.
   * @locus Anywhere
   * @method newContext
   * @memberof MongoSchema
   * @instance
   * @returns {ValidationContext} A fresh validation context.
   */
  newContext() {
    return new ValidationContext(this);
  }

  /**
   * @summary Get or create a named validation context. Named contexts are cached — calling `namedContext('form')` twice returns the same context, preserving its error state.
   * @locus Anywhere
   * @method namedContext
   * @memberof MongoSchema
   * @instance
   * @param {String} name Context identifier.
   * @returns {ValidationContext} The cached validation context for this name.
   */
  namedContext(name) {
    if (!this._namedContexts) this._namedContexts = new Map();
    if (!this._namedContexts.has(name)) {
      const ctx = new ValidationContext(this);
      ctx._name = name;
      this._namedContexts.set(name, ctx);
    }
    return this._namedContexts.get(name);
  }

  /**
   * @summary Compile this schema to a MongoDB `$jsonSchema` validator document. Fields typed as `MongoSchema.Any` or custom constructors are excluded.
   * @locus Anywhere
   * @method toJsonSchema
   * @memberof MongoSchema
   * @instance
   * @returns {Object} A MongoDB `$jsonSchema` object suitable for `collMod` or `createCollection`.
   */
  toJsonSchema() {
    return compileToJsonSchema(this._ir);
  }

  /**
   * @summary Register a per-field validator function on this schema instance. The function is called for every top-level field during validation. Return a string error type to fail, or `undefined` to pass.
   * @locus Anywhere
   * @method addValidator
   * @memberof MongoSchema
   * @instance
   * @param {Function} fn Validator function. Receives a context as `this` with `key`, `value`, `isSet`, `field()`, `siblingField()`, etc.
   */
  addValidator(fn) { this._validators.push(fn); }

  /**
   * @summary Register a whole-document validator on this schema instance. The function receives the entire document and should return an array of error detail objects, or an empty array if valid.
   * @locus Anywhere
   * @method addDocValidator
   * @memberof MongoSchema
   * @instance
   * @param {Function} fn Document validator function. Receives the document, returns an array of `{ name, type, value, message }` objects.
   */
  addDocValidator(fn) { this._docValidators.push(fn); }

  /**
   * @summary Get the raw field definition for a key, or the entire definition object if no key is provided.
   * @locus Anywhere
   * @method schema
   * @memberof MongoSchema
   * @instance
   * @param {String} [key] Field path. If omitted, returns the full definition.
   * @returns {Object} The field definition, the full definition object, or `undefined`.
   */
  schema(key) {
    if (!key) return this._definition;
    const def = this._definition[key];
    if (def === undefined) return undefined;
    return normalizeFieldDef(def);
  }

  /**
   * @summary Get a specific property from a field's definition.
   * @locus Anywhere
   * @method get
   * @memberof MongoSchema
   * @instance
   * @param {String} key Field path.
   * @param {String} prop Property name (e.g., `'type'`, `'min'`, `'label'`).
   * @returns {Any} The property value, or `undefined`.
   */
  get(key, prop) {
    const def = this._definition[key];
    if (def === undefined) return undefined;
    return normalizeFieldDef(def)[prop];
  }

  /**
   * @summary Get the human-readable label for a field.
   * @locus Anywhere
   * @method label
   * @memberof MongoSchema
   * @instance
   * @param {String} key Field path.
   * @returns {String} The label, or `undefined` if the field doesn't exist.
   */
  label(key) {
    const desc = this._ir.get(key);
    return desc ? desc.label : undefined;
  }

  /**
   * @summary Get the default value for a field.
   * @locus Anywhere
   * @method defaultValue
   * @memberof MongoSchema
   * @instance
   * @param {String} key Field path.
   * @returns {Any} The default value, or `undefined`.
   */
  defaultValue(key) {
    const desc = this._ir.get(key);
    return desc ? desc.defaultValue : undefined;
  }

  /**
   * @summary Get the allowed values for a field.
   * @locus Anywhere
   * @method getAllowedValuesForKey
   * @memberof MongoSchema
   * @instance
   * @param {String} key Field path.
   * @returns {Array} The allowed values array, or `undefined`.
   */
  getAllowedValuesForKey(key) {
    const desc = this._ir.get(key);
    return desc ? desc.allowedValues : undefined;
  }

  /**
   * @summary Bulk-set labels for multiple fields.
   * @locus Anywhere
   * @method labels
   * @memberof MongoSchema
   * @instance
   * @param {Object} labelMap Map of field paths to label strings.
   */
  labels(labelMap) {
    for (const [key, lbl] of Object.entries(labelMap)) {
      const desc = this._ir.get(key);
      if (desc) desc.label = lbl;
    }
  }
}

// Static markers

/**
 * Integer type marker. Fields typed as `MongoSchema.Integer` accept only
 * whole numbers and compile to `bsonType: ['int', 'long']` in `$jsonSchema`.
 * @type {{ _type: 'MongoSchema.Integer' }}
 */
MongoSchema.Integer = IntegerMarker;

/**
 * Any type marker. Fields typed as `MongoSchema.Any` accept any value and
 * are excluded from `$jsonSchema` compilation.
 * @type {{ _type: 'MongoSchema.Any' }}
 */
MongoSchema.Any = AnyMarker;

/**
 * Create a union type that accepts any of the provided types.
 * @type {Function}
 * @see oneOf
 */
MongoSchema.oneOf = oneOf;

/**
 * Error type constants. Access via `MongoSchema.ErrorTypes.REQUIRED`, etc.
 * @type {Object}
 */
MongoSchema.ErrorTypes = ErrorTypes;

// Global validators

/**
 * @type {Array}
 * @private
 */
MongoSchema._globalValidators = [];
/**
 * @type {Array}
 * @private
 */
MongoSchema._globalDocValidators = [];

/**
 * @summary Register a global per-field validator that runs on all `MongoSchema` instances.
 * @locus Anywhere
 * @param {Function} fn Validator function. Receives a context as `this` with `key`, `value`, `isSet`, etc. Return a string error type to fail, or `undefined` to pass.
 */
MongoSchema.addValidator = function (fn) { MongoSchema._globalValidators.push(fn); };

/**
 * @summary Register a global whole-document validator that runs on all `MongoSchema` instances.
 * @locus Anywhere
 * @param {Function} fn Document validator function. Receives the document, returns an array of `{ name, type, value, message }` objects.
 */
MongoSchema.addDocValidator = function (fn) { MongoSchema._globalDocValidators.push(fn); };
