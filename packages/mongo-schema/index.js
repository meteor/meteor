/**
 * @module meteor/mongo-schema
 * @summary Native schema validation for MongoDB collections in Meteor.
 *
 * Provides the {@link MongoSchema} class for declarative schema definitions with
 * cleaning (type coercion, filtering, defaults, trimming), validation (required,
 * type, constraints, custom), `$jsonSchema` compilation for database-level
 * enforcement, and reactive validation contexts for UI forms.
 *
 * @example
 * import { MongoSchema, ValidationError } from 'meteor/mongo-schema';
 *
 * const PostSchema = new MongoSchema({
 *   title: { type: String, min: 1, max: 200 },
 *   body: String,
 *   tags: [String],
 *   status: { type: String, allowedValues: ['draft', 'published'] },
 *   createdAt: {
 *     type: Date,
 *     autoValue() { if (!this.isSet) return new Date(); },
 *   },
 * });
 *
 * // Attach to a collection (auto-cleans and validates on insert/update)
 * Posts.attachSchema(PostSchema);
 *
 * // Manual usage
 * const cleaned = PostSchema.clean(rawDoc);
 * PostSchema.validate(cleaned); // throws ValidationError on failure
 */
export { MongoSchema } from './schema.js';
export { ValidationError } from './schema_errors.js';

import { setupCollectionIntegration } from './collection_integration.js';
setupCollectionIntegration();
