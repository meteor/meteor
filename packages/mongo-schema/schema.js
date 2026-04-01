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
 * A declarative schema for MongoDB documents with cleaning, validation, and
 * JSON Schema compilation.
 *
 * @example
 * import { MongoSchema } from 'meteor/mongo-schema';
 *
 * const UserSchema = new MongoSchema({
 *   // Shorthand: bare constructor
 *   name: String,
 *
 *   // Full definition with constraints
 *   email: { type: String, regEx: /^.+@.+\..+$/ },
 *
 *   // Integer type with range
 *   age: { type: MongoSchema.Integer, min: 0, max: 150, optional: true },
 *
 *   // Array shorthand
 *   tags: [String],
 *
 *   // Nested object (dot-notation)
 *   'address.street': String,
 *   'address.city': String,
 *   'address.zip': { type: String, regEx: /^\d{5}$/ },
 *
 *   // Union type
 *   score: { type: MongoSchema.oneOf(Number, String), optional: true },
 *
 *   // Auto-value (set on insert)
 *   createdAt: {
 *     type: Date,
 *     autoValue() { if (!this.isSet) return new Date(); },
 *   },
 * });
 *
 * // Clean a document (type coercion, defaults, trimming)
 * const cleaned = UserSchema.clean({ name: '  Alice  ', age: '25' });
 * // => { name: 'Alice', age: 25, createdAt: Date(...) }
 *
 * // Validate (throws ValidationError on failure)
 * UserSchema.validate(cleaned);
 *
 * // Reactive validation context (for forms)
 * const ctx = UserSchema.newContext();
 * ctx.validate(formData);
 * if (!ctx.isValid()) {
 *   console.log(ctx.keyErrorMessage('email'));
 * }
 *
 * // Compile to MongoDB $jsonSchema
 * const jsonSchema = UserSchema.toJsonSchema();
 */
export class MongoSchema {
  /**
   * Create a new schema from a definition object.
   *
   * @param {Object<string, import('./schema_definition.js').FieldDefinition|Function|RegExp|Array>} definition -
   *   Schema definition mapping dot-delimited field paths to field definitions.
   *   Supports shorthand syntax (bare constructors, arrays, RegExp) and full
   *   definition objects with `type`, constraints, and options.
   * @param {MongoSchemaOptions} [options={}] - Schema-level options.
   *
   * @example
   * // Shorthand definitions
   * new MongoSchema({ name: String, tags: [String] });
   *
   * // With options
   * new MongoSchema(
   *   { title: String, body: String },
   *   { requiredByDefault: false }
   * );
   */
  constructor(definition, options = {}) {
    /** @type {true} Sentinel for identifying MongoSchema instances. */
    this._isMongoSchema = true;
    /** @private */
    this._definition = definition;
    /** @type {MongoSchemaOptions} @private */
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
     * @type {Map<string, import('./schema_definition.js').FieldDescriptor>}
     * @private
     */
    this._ir = parseDefinition(definition, this._options);

    // Validator registries
    /** @type {Function[]} @private */
    this._validators = [];
    /** @type {Function[]} @private */
    this._docValidators = [];
  }

  /**
   * Create a new schema by merging this schema's definition with another's.
   * Fields from `otherSchema` override fields with the same key in this schema.
   *
   * @param {MongoSchema} otherSchema - Schema whose fields are merged in.
   * @returns {MongoSchema} A new schema with the combined definitions.
   *
   * @example
   * const base = new MongoSchema({ name: String, email: String });
   * const extended = base.extend(new MongoSchema({
   *   role: { type: String, allowedValues: ['admin', 'user'] }
   * }));
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
   * Create a new schema containing only the specified top-level keys.
   * Nested fields under a picked key are included automatically.
   *
   * @param {...string} keys - Top-level field names to keep.
   * @returns {MongoSchema} A new schema with only the selected fields.
   *
   * @example
   * const full = new MongoSchema({
   *   name: String,
   *   email: String,
   *   'address.city': String,
   *   'address.zip': String,
   * });
   * const nameOnly = full.pick('name');
   * // Schema with just { name: String }
   *
   * const withAddress = full.pick('name', 'address');
   * // Schema with name + address.city + address.zip
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
   * Create a new schema excluding the specified top-level keys.
   * Nested fields under an omitted key are excluded automatically.
   *
   * @param {...string} keys - Top-level field names to exclude.
   * @returns {MongoSchema} A new schema without the specified fields.
   *
   * @example
   * const schema = new MongoSchema({ name: String, email: String, age: Number });
   * const noAge = schema.omit('age');
   * // Schema with { name: String, email: String }
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
   * Clean a document or modifier by applying the cleaning pipeline: filter
   * unknown keys, auto-convert types, trim strings, remove empty strings,
   * and apply default/auto values.
   *
   * @param {Object} doc - The document or modifier to clean.
   * @param {import('./schema_clean.js').CleanOptions} [options={}] - Override
   *   cleaning options. Merged with the schema's default clean options.
   * @returns {Object} The cleaned document (a new object by default, or the
   *   same object if `mutate: true`).
   *
   * @example
   * const schema = new MongoSchema({
   *   name: { type: String, defaultValue: 'Anonymous' },
   *   age: Number,
   * });
   *
   * schema.clean({ name: '  Alice  ', age: '30', extra: true });
   * // => { name: 'Alice', age: 30 }
   *
   * schema.clean({});
   * // => { name: 'Anonymous' }
   *
   * // Clean a modifier
   * schema.clean({ $set: { name: '  Bob  ' } }, { isModifier: true });
   * // => { $set: { name: 'Bob' } }
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
   * Extract a sub-schema for a nested object field. Returns a new `MongoSchema`
   * containing only the child fields under the given key.
   *
   * @param {string} key - The parent field path (e.g., `'address'`).
   * @returns {MongoSchema} A new schema for the nested object's fields.
   *
   * @example
   * const schema = new MongoSchema({
   *   'address.city': String,
   *   'address.zip': String,
   * });
   * const addressSchema = schema.getObjectSchema('address');
   * // Schema with { city: String, zip: String }
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
   * Validate a document against this schema. Throws a
   * {@link import('./schema_errors.js').ValidationError} if any fields
   * fail validation.
   *
   * @param {Object} doc - The document or modifier to validate.
   * @param {import('./schema_validate.js').ValidateOptions} [options={}] - Validation options.
   * @throws {import('./schema_errors.js').ValidationError} If validation fails.
   *
   * @example
   * const schema = new MongoSchema({ name: String, age: { type: Number, min: 0 } });
   *
   * schema.validate({ name: 'Alice', age: 25 }); // OK
   *
   * schema.validate({ age: -1 }); // Throws: "Name is required"
   *
   * // Validate a modifier
   * schema.validate({ $set: { age: 30 } }, { modifier: true });
   *
   * // Skip specific error types
   * schema.validate(doc, { ignore: [MongoSchema.ErrorTypes.REQUIRED] });
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
   * Create a new, unnamed {@link ValidationContext} for this schema.
   * Validation contexts collect errors without throwing and support
   * reactive error display.
   *
   * @returns {ValidationContext} A fresh validation context.
   *
   * @example
   * const ctx = schema.newContext();
   * const isValid = ctx.validate(formData);
   * if (!isValid) {
   *   console.log(ctx.validationErrors());
   * }
   */
  newContext() {
    return new ValidationContext(this);
  }

  /**
   * Get or create a named {@link ValidationContext}. Named contexts are cached
   * on the schema instance — calling `namedContext('form')` twice returns the
   * same context, preserving its error state.
   *
   * @param {string} name - Context identifier.
   * @returns {ValidationContext} The cached validation context for this name.
   *
   * @example
   * const ctx = schema.namedContext('editForm');
   * ctx.validate(formData);
   * // Later, retrieve the same context:
   * schema.namedContext('editForm').isValid();
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
   * Compile this schema to a MongoDB `$jsonSchema` validator document.
   * Suitable for use with `db.createCollection()` or the `collMod` command.
   *
   * Fields typed as `MongoSchema.Any` or custom constructors are excluded.
   *
   * @returns {import('./schema_jsonschema.js').JsonSchema} A MongoDB `$jsonSchema` object.
   *
   * @example
   * const jsonSchema = schema.toJsonSchema();
   * await db.command({
   *   collMod: 'users',
   *   validator: { $jsonSchema: jsonSchema },
   *   validationLevel: 'moderate',
   * });
   */
  toJsonSchema() {
    return compileToJsonSchema(this._ir);
  }

  /**
   * Register a per-field validator function on this schema instance. The function
   * is called for **every** top-level field during validation, receiving a
   * {@link import('./schema_validate.js').CustomValidatorContext} as `this`.
   *
   * Return a string error type to fail validation, or `undefined` to pass.
   *
   * @param {function(this:import('./schema_validate.js').CustomValidatorContext): string|undefined} fn -
   *   Validator function.
   *
   * @example
   * schema.addValidator(function () {
   *   if (this.key === 'endDate') {
   *     const startDate = this.field('startDate');
   *     if (startDate.isSet && this.value < startDate.value) {
   *       return 'endBeforeStart';
   *     }
   *   }
   * });
   */
  addValidator(fn) { this._validators.push(fn); }

  /**
   * Register a whole-document validator on this schema instance. The function
   * receives the entire document and should return an array of error detail
   * objects, or an empty array if valid.
   *
   * @param {(doc: Object) => import('./schema_errors.js').ValidationErrorDetail[]} fn -
   *   Document validator function.
   *
   * @example
   * schema.addDocValidator((doc) => {
   *   const errors = [];
   *   if (doc.min > doc.max) {
   *     errors.push({
   *       name: 'min',
   *       type: 'minGreaterThanMax',
   *       value: doc.min,
   *       message: 'Min must not exceed max',
   *     });
   *   }
   *   return errors;
   * });
   */
  addDocValidator(fn) { this._docValidators.push(fn); }

  /**
   * Get the raw field definition for a key, or the entire definition object.
   *
   * @param {string} [key] - Field path. If omitted, returns the full definition.
   * @returns {import('./schema_definition.js').FieldDefinition|Object|undefined}
   *   The field definition, the full definition object, or `undefined` if the key
   *   does not exist.
   *
   * @example
   * schema.schema('name');  // { type: String }
   * schema.schema();        // { name: { type: String }, ... }
   */
  schema(key) {
    if (!key) return this._definition;
    const def = this._definition[key];
    if (def === undefined) return undefined;
    return normalizeFieldDef(def);
  }

  /**
   * Get a specific property from a field's raw definition.
   *
   * @param {string} key - Field path.
   * @param {string} prop - Property name (e.g., `'type'`, `'min'`, `'label'`).
   * @returns {*} The property value, or `undefined`.
   *
   * @example
   * schema.get('age', 'min');  // 0
   * schema.get('age', 'type'); // MongoSchema.Integer
   */
  get(key, prop) {
    const def = this._definition[key];
    if (def === undefined) return undefined;
    return normalizeFieldDef(def)[prop];
  }

  /**
   * Get the human-readable label for a field.
   *
   * @param {string} key - Field path.
   * @returns {string|undefined} The label, or `undefined` if the field doesn't exist.
   *
   * @example
   * schema.label('createdAt'); // 'Created at'
   */
  label(key) {
    const desc = this._ir.get(key);
    return desc ? desc.label : undefined;
  }

  /**
   * Get the default value for a field.
   *
   * @param {string} key - Field path.
   * @returns {*} The default value, or `undefined`.
   *
   * @example
   * schema.defaultValue('score'); // 0
   */
  defaultValue(key) {
    const desc = this._ir.get(key);
    return desc ? desc.defaultValue : undefined;
  }

  /**
   * Get the allowed values for a field.
   *
   * @param {string} key - Field path.
   * @returns {Array|undefined} The allowed values array, or `undefined`.
   *
   * @example
   * schema.getAllowedValuesForKey('role'); // ['admin', 'user', 'guest']
   */
  getAllowedValuesForKey(key) {
    const desc = this._ir.get(key);
    return desc ? desc.allowedValues : undefined;
  }

  /**
   * Bulk-set labels for multiple fields.
   *
   * @param {Object<string, string>} labelMap - Map of field paths to labels.
   *
   * @example
   * schema.labels({
   *   name: 'Full Name',
   *   email: 'Email Address',
   *   'address.city': 'City',
   * });
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
 * @type {typeof import('./types.js').oneOf}
 * @see {@link import('./types.js').oneOf}
 */
MongoSchema.oneOf = oneOf;

/**
 * Error type constants. Access via `MongoSchema.ErrorTypes.REQUIRED`, etc.
 * @type {typeof import('./schema_errors.js').ErrorTypes}
 */
MongoSchema.ErrorTypes = ErrorTypes;

// Global validators

/** @type {Function[]} @private */
MongoSchema._globalValidators = [];
/** @type {Function[]} @private */
MongoSchema._globalDocValidators = [];

/**
 * Register a global per-field validator that runs on **all** `MongoSchema` instances.
 *
 * @param {function(this:import('./schema_validate.js').CustomValidatorContext): string|undefined} fn -
 *   Validator function.
 * @static
 */
MongoSchema.addValidator = function (fn) { MongoSchema._globalValidators.push(fn); };

/**
 * Register a global whole-document validator that runs on **all** `MongoSchema` instances.
 *
 * @param {(doc: Object) => import('./schema_errors.js').ValidationErrorDetail[]} fn -
 *   Document validator function.
 * @static
 */
MongoSchema.addDocValidator = function (fn) { MongoSchema._globalDocValidators.push(fn); };
