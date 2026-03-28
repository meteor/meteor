// packages/mongo-schema/schema_context.js
import { collectErrors } from './schema_validate.js';

export class ValidationContext {
  constructor(schema) {
    this._schema = schema;
    this._errors = [];
    this._dep = null;
    // Lazy-init Tracker.Dependency if available
    if (typeof Package !== 'undefined' && Package.tracker) {
      this._dep = new Package.tracker.Tracker.Dependency();
    }
  }

  validate(doc, options = {}) {
    // Pass schema instance so collectErrors can run doc/global validators
    this._errors = collectErrors(this._schema._ir, doc, {
      ...options,
      _schema: this._schema,
    });

    if (this._dep) this._dep.changed();
    return this._errors.length === 0;
  }

  isValid() {
    if (this._dep) this._dep.depend();
    return this._errors.length === 0;
  }

  validationErrors() {
    if (this._dep) this._dep.depend();
    return this._errors;
  }

  keyIsInvalid(key) {
    if (this._dep) this._dep.depend();
    return this._errors.some(e => e.name === key);
  }

  keyErrorMessage(key) {
    if (this._dep) this._dep.depend();
    const err = this._errors.find(e => e.name === key);
    return err ? err.message : '';
  }
}
