// packages/mongo-schema/schema_context.js

/**
 * @module mongo-schema/schema_context
 * @summary Provides `ValidationContext`, a stateful validation wrapper that
 * collects errors without throwing and integrates with Meteor's Tracker for
 * reactive error display in UI forms.
 */

import { collectErrors } from './schema_validate.js';

/**
 * A stateful validation context that stores errors from the most recent
 * `validate()` call. Integrates with Meteor Tracker for reactive invalidation
 * when errors change — UI templates that read `isValid()`, `validationErrors()`,
 * `keyIsInvalid()`, or `keyErrorMessage()` will re-run automatically.
 *
 * Create via `schema.newContext()` or `schema.namedContext(name)`.
 *
 * @example
 * const schema = new MongoSchema({ name: { type: String } });
 * const ctx = schema.newContext();
 *
 * ctx.validate({ name: 42 });    // returns false
 * ctx.isValid();                  // false
 * ctx.validationErrors();         // [{ name: 'name', type: 'expectedType', ... }]
 * ctx.keyIsInvalid('name');       // true
 * ctx.keyErrorMessage('name');    // 'Name expected type string'
 *
 * ctx.validate({ name: 'Alice' }); // returns true
 * ctx.isValid();                    // true
 */
export class ValidationContext {
  /**
   * @param {import('./schema.js').MongoSchema} schema - The schema instance this context validates against.
   */
  constructor(schema) {
    /** @private */
    this._schema = schema;
    /** @type {import('./schema_errors.js').ValidationErrorDetail[]} @private */
    this._errors = [];
    /** @private */
    this._dep = null;
    // Lazy-init Tracker.Dependency if available
    if (typeof Package !== 'undefined' && Package.tracker) {
      this._dep = new Package.tracker.Tracker.Dependency();
    }
  }

  /**
   * Validate a document against the schema and store the errors.
   * Does **not** throw — returns a boolean instead.
   *
   * @param {Object} doc - The document to validate.
   * @param {import('./schema_validate.js').ValidateOptions} [options={}] - Validation options.
   * @returns {boolean} `true` if the document is valid, `false` otherwise.
   */
  validate(doc, options = {}) {
    const schema = this._schema;
    this._errors = collectErrors(schema._ir, doc, {
      ...options,
      _schema: schema,
      _validators: schema._validators,
      _docValidators: schema._docValidators,
      _globalValidators: schema.constructor._globalValidators || [],
      _globalDocValidators: schema.constructor._globalDocValidators || [],
    });

    if (this._dep) this._dep.changed();
    return this._errors.length === 0;
  }

  /**
   * Check whether the last `validate()` call produced no errors.
   * Reactive when Tracker is available.
   *
   * @returns {boolean} `true` if there are no validation errors.
   */
  isValid() {
    if (this._dep) this._dep.depend();
    return this._errors.length === 0;
  }

  /**
   * Retrieve all errors from the last `validate()` call.
   * Reactive when Tracker is available.
   *
   * @returns {import('./schema_errors.js').ValidationErrorDetail[]} Array of error details,
   *   or an empty array if valid.
   */
  validationErrors() {
    if (this._dep) this._dep.depend();
    return [...this._errors];
  }

  /**
   * Check whether a specific field has a validation error.
   * Reactive when Tracker is available.
   *
   * @param {string} key - The field path to check (e.g., `'address.city'`).
   * @returns {boolean} `true` if the field has at least one error.
   */
  keyIsInvalid(key) {
    if (this._dep) this._dep.depend();
    return this._errors.some(e => e.name === key);
  }

  /**
   * Get the error message for a specific field, or an empty string if valid.
   * Reactive when Tracker is available.
   *
   * @param {string} key - The field path to check.
   * @returns {string} The error message, or `''` if no error exists for this key.
   */
  keyErrorMessage(key) {
    if (this._dep) this._dep.depend();
    const err = this._errors.find(e => e.name === key);
    return err ? err.message : '';
  }
}
