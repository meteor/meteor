// packages/mongo-schema/tests/schema_errors_tests.js
import { Tinytest } from 'meteor/tinytest';
import { MongoSchema, ValidationError } from 'meteor/mongo-schema';

Tinytest.add('errors - ErrorTypes constants exist', function (test) {
  test.equal(MongoSchema.ErrorTypes.REQUIRED, 'required');
  test.equal(MongoSchema.ErrorTypes.EXPECTED_TYPE, 'expectedType');
  test.equal(MongoSchema.ErrorTypes.MIN_STRING, 'minString');
  test.equal(MongoSchema.ErrorTypes.MAX_STRING, 'maxString');
  test.equal(MongoSchema.ErrorTypes.MIN_NUMBER, 'minNumber');
  test.equal(MongoSchema.ErrorTypes.MAX_NUMBER, 'maxNumber');
  test.equal(MongoSchema.ErrorTypes.MIN_NUMBER_EXCLUSIVE, 'minNumberExclusive');
  test.equal(MongoSchema.ErrorTypes.MAX_NUMBER_EXCLUSIVE, 'maxNumberExclusive');
  test.equal(MongoSchema.ErrorTypes.MIN_DATE, 'minDate');
  test.equal(MongoSchema.ErrorTypes.MAX_DATE, 'maxDate');
  test.equal(MongoSchema.ErrorTypes.BAD_DATE, 'badDate');
  test.equal(MongoSchema.ErrorTypes.MIN_COUNT, 'minCount');
  test.equal(MongoSchema.ErrorTypes.MAX_COUNT, 'maxCount');
  test.equal(MongoSchema.ErrorTypes.MUST_BE_INTEGER, 'noDecimal');
  test.equal(MongoSchema.ErrorTypes.VALUE_NOT_ALLOWED, 'notAllowed');
  test.equal(MongoSchema.ErrorTypes.FAILED_REGULAR_EXPRESSION, 'regEx');
  test.equal(MongoSchema.ErrorTypes.KEY_NOT_IN_SCHEMA, 'keyNotInSchema');
});

Tinytest.add('errors - ValidationError is constructable', function (test) {
  const errors = [
    { name: 'email', type: 'required', value: undefined, message: 'Email is required' },
  ];
  const err = new ValidationError(errors);
  test.instanceOf(err, Error);
  test.equal(err.error, 'validation-error');
  test.equal(err.details.length, 1);
  test.equal(err.details[0].name, 'email');
  test.equal(err.details[0].type, 'required');
  test.equal(err.message, 'Email is required [validation-error]');
});

Tinytest.add('errors - ValidationError with multiple errors', function (test) {
  const errors = [
    { name: 'name', type: 'required', value: undefined, message: 'Name is required' },
    { name: 'age', type: 'expectedType', value: 'abc', message: 'Age must be a number' },
  ];
  const err = new ValidationError(errors);
  test.equal(err.details.length, 2);
  // Message uses first error
  test.equal(err.message, 'Name is required [validation-error]');
});

Tinytest.add('errors - ValidationError with empty array', function (test) {
  const err = new ValidationError([]);
  test.equal(err.details.length, 0);
  test.equal(err.message, 'Validation failed [validation-error]');
});
