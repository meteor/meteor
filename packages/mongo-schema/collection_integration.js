// packages/mongo-schema/collection_integration.js
import { MongoSchema } from './schema.js';
import { clean } from './schema_clean.js';
import { validate } from './schema_validate.js';

export function setupCollectionIntegration() {
  if (typeof Package === 'undefined' || !Package.mongo) return;

  const Mongo = Package.mongo.Mongo;

  // Register attachSchema and schema methods
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

  Mongo.Collection.prototype.schema = function () {
    return this._schema || null;
  };

  Mongo.Collection.prototype.schemaEnforcedOnDatabase = function () {
    return !!(this._schemaOptions && this._schemaOptions.enforceOnDatabase);
  };
}

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
    filter: operationOpts.filter !== undefined ? operationOpts.filter : undefined,
    autoConvert: operationOpts.autoConvert !== undefined ? operationOpts.autoConvert : undefined,
    removeEmptyStrings: operationOpts.removeEmptyStrings !== undefined ? operationOpts.removeEmptyStrings : undefined,
    trimStrings: operationOpts.trimStrings !== undefined ? operationOpts.trimStrings : undefined,
    getAutoValues: operationOpts.getAutoValues !== undefined ? operationOpts.getAutoValues : undefined,
    isModifier: operationType !== 'insert',
    isUpsert: operationType === 'upsert',
    extendAutoValueContext: ctx,
  };
}

function shouldBypass(collection, opts) {
  if (!collection._schema) return true;
  if (opts.bypassSchema) {
    // Only honored in trusted server-side code
    const isTrusted = typeof Meteor !== 'undefined' && Meteor.isServer;
    return isTrusted;
  }
  return false;
}

function wrapMutationMethods(collection) {
  // --- insertAsync ---
  const originalInsertAsync = collection.insertAsync.bind(collection);
  collection.insertAsync = async function (doc, options = {}) {
    if (shouldBypass(this, options)) return originalInsertAsync(doc, options);

    const schema = this._schema;
    const cleanOpts = buildCleanOptions(options, 'insert');
    const cleaned = schema.clean(doc, cleanOpts);

    if (options.validate !== false) {
      schema.validate(cleaned);
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
      schema.validate(cleaned, { modifier: true });
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
      schema.validate(cleaned, { modifier: true, upsert: true });
    }

    return originalUpsertAsync(selector, cleaned, options);
  };

  // removeAsync — no schema processing
  // Left unwrapped intentionally
}

async function applyDatabaseEnforcement(collection, options) {
  // Server-only, deferred to after startup
  if (typeof Meteor === 'undefined' || !Meteor.isServer) return;

  const schema = collection._schema;
  const jsonSchema = schema.toJsonSchema();
  const jsonStr = JSON.stringify(jsonSchema);

  // Compute hash
  const { createHash } = require('crypto');
  const hash = createHash('sha256').update(jsonStr).digest('hex');

  const collectionName = collection._name;
  const validationLevel = options.validationLevel || 'moderate';
  const validationAction = options.validationAction || 'error';

  // Use raw MongoDB driver to check/apply
  Meteor.startup(async () => {
    try {
      const db = collection._driver.mongo.db || MongoInternals.defaultRemoteCollectionDriver().mongo.db;

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
