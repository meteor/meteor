// packages/mongo-schema/schema_errors.js

/**
 * Enumeration of all validation error type strings. Each key maps to a
 * short identifier used in {@link ValidationErrorDetail.type}.
 *
 * | Constant | Value | Triggered when |
 * |----------|-------|----------------|
 * | `REQUIRED` | `'required'` | A required field is missing or `null` |
 * | `MIN_STRING` | `'minString'` | String length is below `min` |
 * | `MAX_STRING` | `'maxString'` | String length exceeds `max` |
 * | `MIN_NUMBER` | `'minNumber'` | Number is below `min` |
 * | `MAX_NUMBER` | `'maxNumber'` | Number exceeds `max` |
 * | `MIN_NUMBER_EXCLUSIVE` | `'minNumberExclusive'` | Number is &le; `min` with `exclusiveMin` |
 * | `MAX_NUMBER_EXCLUSIVE` | `'maxNumberExclusive'` | Number is &ge; `max` with `exclusiveMax` |
 * | `MIN_DATE` | `'minDate'` | Date is before `min` |
 * | `MAX_DATE` | `'maxDate'` | Date is after `max` |
 * | `BAD_DATE` | `'badDate'` | Value is a `Date` but invalid (`NaN`) |
 * | `MIN_COUNT` | `'minCount'` | Array has fewer than `minCount` items |
 * | `MAX_COUNT` | `'maxCount'` | Array has more than `maxCount` items |
 * | `MUST_BE_INTEGER` | `'noDecimal'` | Number has a fractional part but `Integer` type expected |
 * | `VALUE_NOT_ALLOWED` | `'notAllowed'` | Value is not in `allowedValues` |
 * | `EXPECTED_TYPE` | `'expectedType'` | Value does not match the expected type |
 * | `FAILED_REGULAR_EXPRESSION` | `'regEx'` | String does not match `regEx` pattern(s) |
 * | `KEY_NOT_IN_SCHEMA` | `'keyNotInSchema'` | Document contains a key not defined in the schema |
 * | `DENY_INSERT` | `'denyInsert'` | Field with `denyInsert: true` was set during insert |
 * | `DENY_UPDATE` | `'denyUpdate'` | Field with `denyUpdate: true` was set during update |
 *
 * @type {Readonly<Record<string, string>>}
 *
 * @example
 * import { MongoSchema } from 'meteor/mongo-schema';
 *
 * if (error.type === MongoSchema.ErrorTypes.REQUIRED) {
 *   console.log('Field is required');
 * }
 */
export const ErrorTypes = {
  REQUIRED: 'required',
  MIN_STRING: 'minString',
  MAX_STRING: 'maxString',
  MIN_NUMBER: 'minNumber',
  MAX_NUMBER: 'maxNumber',
  MIN_NUMBER_EXCLUSIVE: 'minNumberExclusive',
  MAX_NUMBER_EXCLUSIVE: 'maxNumberExclusive',
  MIN_DATE: 'minDate',
  MAX_DATE: 'maxDate',
  BAD_DATE: 'badDate',
  MIN_COUNT: 'minCount',
  MAX_COUNT: 'maxCount',
  MUST_BE_INTEGER: 'noDecimal',
  VALUE_NOT_ALLOWED: 'notAllowed',
  EXPECTED_TYPE: 'expectedType',
  FAILED_REGULAR_EXPRESSION: 'regEx',
  KEY_NOT_IN_SCHEMA: 'keyNotInSchema',
  DENY_INSERT: 'denyInsert',
  DENY_UPDATE: 'denyUpdate',
};
Object.freeze(ErrorTypes);

/**
 * Thrown by `MongoSchema#validate()` when one or more fields fail validation.
 *
 * Extends `Meteor.Error` (when available) for DDP transport, or plain `Error`
 * otherwise. Compatible with the `mdg:validation-error` contract — error code
 * is always `'validation-error'`.
 *
 * @extends {Meteor.Error|Error}
 *
 * @example
 * import { MongoSchema, ValidationError } from 'meteor/mongo-schema';
 *
 * const schema = new MongoSchema({ name: { type: String } });
 * try {
 *   schema.validate({ name: 42 });
 * } catch (err) {
 *   if (err instanceof ValidationError) {
 *     console.log(err.details); // [{ name: 'name', type: 'expectedType', ... }]
 *   }
 * }
 */
export class ValidationError extends (typeof Meteor !== 'undefined' ? Meteor.Error : Error) {
  /**
   * @param {ValidationErrorDetail[]} errors - Array of individual field validation errors.
   */
  constructor(errors) {
    const firstMessage = errors && errors.length > 0
      ? errors[0].message
      : 'Validation failed';
    super('validation-error', firstMessage);
    /** @type {string} */
    this.error = 'validation-error';
    /** @type {Array} */
    this.details = errors || [];
    // Ensure name is set for error identification
    if (!this.name) this.name = 'ValidationError';
  }
}

/**
 * Static error code constant.
 * @type {string}
 */
ValidationError.ERROR_CODE = 'validation-error';
