// packages/mongo-schema/schema_errors.js

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

/**
 * ValidationError - compatible with mdg:validation-error contract.
 * Subclass of Meteor.Error for DDP transport.
 */
export class ValidationError extends (typeof Meteor !== 'undefined' ? Meteor.Error : Error) {
  constructor(errors) {
    const firstMessage = errors && errors.length > 0
      ? errors[0].message
      : 'Validation failed';
    super('validation-error', firstMessage);
    this.error = 'validation-error';
    this.details = errors || [];
    // Ensure name is set for error identification
    if (!this.name) this.name = 'ValidationError';
  }
}

// Make it identifiable
ValidationError.ERROR_CODE = 'validation-error';
