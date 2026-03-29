// packages/mongo-schema/collection_integration.js

/**
 * @module mongo-schema/collection_integration
 * @summary Integrates MongoSchema with `Mongo.Collection` by adding
 * `attachSchema()`, `schema()`, and `schemaEnforcedOnDatabase()` methods.
 * When a schema is attached, `insertAsync`, `updateAsync`, and `upsertAsync`
 * are wrapped to automatically clean and validate documents.
 */

import { MongoSchema } from './schema.js';

/**
 * Set up the collection integration by patching `Mongo.Collection.prototype`.
 * Called once at module load time. No-ops if the `mongo` package is not loaded.
 *
 * Adds the following methods to `Mongo.Collection.prototype`:
 *
 * - **`attachSchema(schema, options)`** — Attach a `MongoSchema` to this collection.
 * - **`schema()`** — Return the attached `MongoSchema` instance, or `null`.
 * - **`schemaEnforcedOnDatabase()`** — Return `true` if `$jsonSchema` enforcement is active.
 */
export function setupCollectionIntegration() {
  if (typeof Package === 'undefined' || !Package.mongo) return;

  const Mongo = Package.mongo.Mongo;

  /**
   * Attach a schema to this collection. Subsequent `insertAsync`, `updateAsync`,
   * and `upsertAsync` calls will automatically clean and validate documents.
   *
   * If a schema is already attached and `options.replace` is not `true`, the new
   * schema is merged with the existing one via `MongoSchema#extend()`.
   *
   * @method Mongo.Collection#attachSchema
   * @param {MongoSchema} schema - The schema to attach.
   * @param {Object} [options={}] - Attachment options.
   * @param {boolean} [options.replace=false] - Replace the existing schema entirely
   *   instead of merging.
   * @param {boolean} [options.enforceOnDatabase=false] - Apply the schema as a MongoDB
   *   `$jsonSchema` validator via `collMod` (server only). Requires a running MongoDB
   *   server with `collMod` support.
   * @param {string} [options.validationLevel='moderate'] - MongoDB validation level
   *   (`'off'`, `'strict'`, or `'moderate'`). Only used with `enforceOnDatabase`.
   * @param {string} [options.validationAction='error'] - MongoDB validation action
   *   (`'error'` or `'warn'`). Only used with `enforceOnDatabase`.
   * @throws {Error} If `schema` is not a `MongoSchema` instance.
   *
   * @example
   * const Players = new Mongo.Collection('players');
   *
   * Players.attachSchema(new MongoSchema({
   *   name: { type: String, min: 1 },
   *   score: { type: Number, defaultValue: 0 },
   * }));
   *
   * // With database-level enforcement:
   * Players.attachSchema(schema, {
   *   enforceOnDatabase: true,
   *   validationLevel: 'strict',
   * });
   */
  Mongo.Collection.prototype.attachSchema = function (schema, options = {}) {
    if (!(schema instanceof MongoSchema)) {
      throw new Error('attachSchema requires a MongoSchema instance');
    }

    if (options.replace || !this._schema) {
      this._schema = schema;
    } else {
      this._schema = this._schema.extend(schema);
    }

    this._schemaOptions = { ...this._schemaOptions, ...options };

    // Wrap mutation methods (only once)
    if (!this._schemaHooked) {
      this._schemaHooked = true;
      wrapMutationMethods(this);
    }

    // Database enforcement (server only)
    if (options.enforceOnDatabase && Meteor.isServer) {
      applyDatabaseEnforcement(this, options);
    }
  };

  /**
   * Return the currently attached schema, or `null` if none is attached.
   *
   * @method Mongo.Collection#schema
   * @returns {MongoSchema|null}
   */
  Mongo.Collection.prototype.schema = function () {
    return this._schema || null;
  };

  /**
   * Check whether this collection has database-level `$jsonSchema` enforcement active.
   *
   * @method Mongo.Collection#schemaEnforcedOnDatabase
   * @returns {boolean}
   */
  Mongo.Collection.prototype.schemaEnforcedOnDatabase = function () {
    return !!(this._schemaOptions && this._schemaOptions.enforceOnDatabase);
  };
}

/**
 * Build clean options for the schema cleaning pipeline based on the operation
 * type and any user-provided overrides.
 *
 * @param {Object} operationOpts - Options passed to the mutation method.
 * @param {'insert'|'update'|'upsert'} operationType - The type of mutation.
 * @returns {import('./schema_clean.js').CleanOptions} Options for `MongoSchema#clean()`.
 */
function buildCleanOptions(operationOpts, operationType) {
  const ctx = {
    isInsert: operationType === 'insert',
    isUpdate: operationType === 'update',
    isUpsert: operationType === 'upsert',
    userId: typeof Meteor !== 'undefined' ? (Meteor.userId ? Meteor.userId() : null) : null,
    isFromTrustedCode: typeof Meteor !== 'undefined' ? Meteor.isServer : false,
  };

  return {
    mutate: true,
    filter: operationOpts.filter,
    autoConvert: operationOpts.autoConvert,
    removeEmptyStrings: operationOpts.removeEmptyStrings,
    trimStrings: operationOpts.trimStrings,
    getAutoValues: operationOpts.getAutoValues,
    isModifier: operationType !== 'insert',
    isUpsert: operationType === 'upsert',
    extendAutoValueContext: ctx,
  };
}

/**
 * Determine whether schema processing should be bypassed for this operation.
 * Bypass occurs when no schema is attached, or when `options.bypassSchema`
 * is `true` **and** the code is running in a trusted server context.
 *
 * @param {Mongo.Collection} collection - The collection instance.
 * @param {Object} opts - Mutation options.
 * @param {boolean} [opts.bypassSchema] - If `true` and on the server, skip
 *   schema cleaning and validation.
 * @returns {boolean} `true` to skip schema processing.
 */
function shouldBypass(collection, opts) {
  if (!collection._schema) return true;
  if (opts.bypassSchema) {
    // Only honored in trusted server-side code
    const isTrusted = typeof Meteor !== 'undefined' && Meteor.isServer;
    return isTrusted;
  }
  return false;
}

/**
 * Wrap `insertAsync`, `updateAsync`, and `upsertAsync` on a collection to
 * automatically clean and validate documents before passing them to the
 * original methods.
 *
 * Each wrapped method:
 * 1. Checks `shouldBypass()` — if `true`, delegates directly to the original.
 * 2. Cleans the document/modifier via `schema.clean()`.
 * 3. Validates via `schema.validate()` (unless `options.validate === false`).
 * 4. Calls the original method with the cleaned document.
 *
 * @param {Mongo.Collection} collection - The collection to wrap.
 */
function wrapMutationMethods(collection) {
  // --- insertAsync ---
  const originalInsertAsync = collection.insertAsync.bind(collection);
  collection.insertAsync = async function (doc, options = {}) {
    if (shouldBypass(this, options)) return originalInsertAsync(doc, options);

    const schema = this._schema;
    const cleanOpts = buildCleanOptions(options, 'insert');
    const cleaned = schema.clean(doc, cleanOpts);

    if (options.validate !== false) {
      schema.validate(cleaned, { isInsert: true });
    }

    return originalInsertAsync(cleaned, options);
  };

  // --- updateAsync ---
  const originalUpdateAsync = collection.updateAsync.bind(collection);
  collection.updateAsync = async function (selector, modifier, ...rest) {
    const options = (typeof rest[0] === 'object' && rest[0] !== null && !Array.isArray(rest[0])) ? rest[0] : {};
    if (shouldBypass(this, options)) return originalUpdateAsync(selector, modifier, ...rest);

    const schema = this._schema;
    const cleanOpts = buildCleanOptions(options, 'update');
    const cleaned = schema.clean(modifier, cleanOpts);

    if (options.validate !== false) {
      schema.validate(cleaned, { modifier: true, isUpdate: true });
    }

    return originalUpdateAsync(selector, cleaned, ...rest);
  };

  // --- upsertAsync ---
  const originalUpsertAsync = collection.upsertAsync.bind(collection);
  collection.upsertAsync = async function (selector, modifier, options = {}) {
    if (shouldBypass(this, options)) return originalUpsertAsync(selector, modifier, options);

    const schema = this._schema;
    const cleanOpts = buildCleanOptions(options, 'upsert');
    const cleaned = schema.clean(modifier, cleanOpts);

    if (options.validate !== false) {
      schema.validate(cleaned, { modifier: true, isUpsert: true, upsert: true });
    }

    return originalUpsertAsync(selector, cleaned, options);
  };

  // removeAsync — no schema processing
  // Left unwrapped intentionally
}

/**
 * Apply database-level `$jsonSchema` enforcement by running a `collMod` command.
 * Uses a `_meteor_schema_versions` collection to track schema hashes and avoid
 * redundant `collMod` calls when the schema hasn't changed.
 *
 * Schedules async work inside `Meteor.startup()` so the database is available.
 * The function itself is synchronous; the actual `collMod` runs in the startup callback.
 *
 * @param {Mongo.Collection} collection - The collection to enforce.
 * @param {Object} options - Enforcement options from `attachSchema`.
 * @param {string} [options.validationLevel='moderate'] - MongoDB validation level.
 * @param {string} [options.validationAction='error'] - MongoDB validation action.
 */
function applyDatabaseEnforcement(collection, options) {
  // Server-only, deferred to after startup
  if (typeof Meteor === 'undefined' || !Meteor.isServer) return;

  const collectionName = collection._name;
  if (!collectionName) {
    console.warn('MongoSchema: Cannot apply database enforcement for anonymous collection (no _name). Skipping.');
    return;
  }

  const schema = collection._schema;
  const jsonSchema = schema.toJsonSchema();
  const jsonStr = JSON.stringify(jsonSchema);

  // Compute hash
  const { createHash } = require('crypto');
  const hash = createHash('sha256').update(jsonStr).digest('hex');
  const validationLevel = options.validationLevel || 'moderate';
  const validationAction = options.validationAction || 'error';

  // Use raw MongoDB driver to check/apply
  Meteor.startup(async () => {
    try {
      const db = collection.rawDatabase();

      // Check schema versions collection
      const versionsCol = db.collection('_meteor_schema_versions');
      const existing = await versionsCol.findOne({ _id: collectionName });

      if (existing && existing.schemaHash === hash) {
        return; // Schema unchanged
      }

      // Apply collMod
      await db.command({
        collMod: collectionName,
        validator: { $jsonSchema: jsonSchema },
        validationLevel,
        validationAction,
      });

      // Store hash
      await versionsCol.updateOne(
        { _id: collectionName },
        { $set: { schemaHash: hash, appliedAt: new Date() } },
        { upsert: true }
      );
    } catch (e) {
      console.error(`MongoSchema: Failed to apply database enforcement for ${collectionName}:`, e.message);
    }
  });
}
