// packages/mongo-schema/tests/schema_validate_tests.js
import { Tinytest } from 'meteor/tinytest';
import { MongoSchema, ValidationError } from 'meteor/mongo-schema';

Tinytest.add('validate - valid document passes', function (test) {
  const schema = new MongoSchema({ name: String, age: Number });
  schema.validate({ name: 'Alice', age: 25 });
  test.ok();
});

Tinytest.add('validate - missing required field throws', function (test) {
  const schema = new MongoSchema({ name: String, age: Number });
  try {
    schema.validate({ name: 'Alice' });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.error, 'validation-error');
    test.equal(e.details[0].name, 'age');
    test.equal(e.details[0].type, 'required');
  }
});

Tinytest.add('validate - optional field can be missing', function (test) {
  const schema = new MongoSchema({ name: String, bio: { type: String, optional: true } });
  schema.validate({ name: 'Alice' });
  test.ok();
});

Tinytest.add('validate - wrong type throws', function (test) {
  const schema = new MongoSchema({ age: Number });
  try {
    schema.validate({ age: 'not a number' });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.details[0].name, 'age');
    test.equal(e.details[0].type, 'expectedType');
  }
});

Tinytest.add('validate - Integer rejects decimal', function (test) {
  const schema = new MongoSchema({ count: { type: MongoSchema.Integer } });
  schema.validate({ count: 5 });
  try {
    schema.validate({ count: 5.5 });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.details[0].type, 'noDecimal');
  }
});

Tinytest.add('validate - Date rejects invalid date', function (test) {
  const schema = new MongoSchema({ d: Date });
  try {
    schema.validate({ d: new Date('invalid') });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.details[0].type, 'badDate');
  }
});

Tinytest.add('validate - _id not required even if requiredByDefault', function (test) {
  const schema = new MongoSchema({ name: String });
  schema.validate({ name: 'Alice' });
  test.ok();
});

Tinytest.add('validate - nested object validates children', function (test) {
  const schema = new MongoSchema({
    address: { type: Object },
    'address.city': String,
    'address.zip': { type: String, optional: true },
  });
  schema.validate({ address: { city: 'NYC' } });
  try {
    schema.validate({ address: {} });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.details[0].name, 'address.city');
    test.equal(e.details[0].type, 'required');
  }
});

Tinytest.add('validate - array validates items', function (test) {
  const schema = new MongoSchema({
    tags: { type: Array },
    'tags.$': String,
  });
  schema.validate({ tags: ['a', 'b'] });
  try {
    schema.validate({ tags: ['a', 123] });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.details[0].type, 'expectedType');
  }
});

Tinytest.add('validate - allowedValues rejects invalid', function (test) {
  const schema = new MongoSchema({
    status: { type: String, allowedValues: ['active', 'inactive'] },
  });
  schema.validate({ status: 'active' });
  try {
    schema.validate({ status: 'pending' });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.details[0].type, 'notAllowed');
  }
});

Tinytest.add('validate - min/max number', function (test) {
  const schema = new MongoSchema({ age: { type: Number, min: 0, max: 120 } });
  schema.validate({ age: 50 });
  try { schema.validate({ age: -1 }); test.fail(); } catch (e) {
    test.equal(e.details[0].type, 'minNumber');
  }
  try { schema.validate({ age: 121 }); test.fail(); } catch (e) {
    test.equal(e.details[0].type, 'maxNumber');
  }
});

Tinytest.add('validate - min/max string length', function (test) {
  const schema = new MongoSchema({ name: { type: String, min: 2, max: 10 } });
  schema.validate({ name: 'Al' });
  try { schema.validate({ name: 'A' }); test.fail(); } catch (e) {
    test.equal(e.details[0].type, 'minString');
  }
  try { schema.validate({ name: 'A'.repeat(11) }); test.fail(); } catch (e) {
    test.equal(e.details[0].type, 'maxString');
  }
});

Tinytest.add('validate - regEx pattern', function (test) {
  const schema = new MongoSchema({
    email: { type: String, regEx: /^.+@.+\..+$/ },
  });
  schema.validate({ email: 'a@b.com' });
  try { schema.validate({ email: 'not-email' }); test.fail(); } catch (e) {
    test.equal(e.details[0].type, 'regEx');
  }
});

Tinytest.add('validate - minCount/maxCount array', function (test) {
  const schema = new MongoSchema({
    tags: { type: Array, minCount: 1, maxCount: 3 },
    'tags.$': String,
  });
  schema.validate({ tags: ['a'] });
  try { schema.validate({ tags: [] }); test.fail(); } catch (e) {
    test.equal(e.details[0].type, 'minCount');
  }
  try { schema.validate({ tags: ['a','b','c','d'] }); test.fail(); } catch (e) {
    test.equal(e.details[0].type, 'maxCount');
  }
});

Tinytest.add('validate - custom validator', function (test) {
  const schema = new MongoSchema({
    startDate: Date,
    endDate: {
      type: Date,
      custom() {
        const start = this.field('startDate');
        if (start.isSet && this.isSet && this.value <= start.value) {
          return 'endDateMustBeAfterStart';
        }
      },
    },
  });
  const now = new Date();
  const later = new Date(now.getTime() + 10000);
  schema.validate({ startDate: now, endDate: later });
  try {
    schema.validate({ startDate: later, endDate: now });
    test.fail();
  } catch (e) {
    test.equal(e.details[0].type, 'endDateMustBeAfterStart');
  }
});

Tinytest.add('validate - partial validation with keys option', function (test) {
  const schema = new MongoSchema({ name: String, age: Number });
  schema.validate({ name: 'Alice' }, { keys: ['name'] });
  test.ok();
});

Tinytest.add('validate - ignore error types', function (test) {
  const schema = new MongoSchema({ name: { type: String, min: 5 } });
  schema.validate({ name: 'Al' }, { ignore: ['minString'] });
  test.ok();
});

Tinytest.add('validate - addValidator per-schema', function (test) {
  const schema = new MongoSchema({ name: String });
  schema.addValidator(function () {
    if (this.key === 'name' && this.value === 'forbidden') {
      return 'forbidden';
    }
  });
  try {
    schema.validate({ name: 'forbidden' });
    test.fail();
  } catch (e) {
    test.equal(e.details[0].type, 'forbidden');
  }
});

Tinytest.add('validate - addDocValidator per-schema', function (test) {
  const schema = new MongoSchema({ a: Number, b: Number });
  schema.addDocValidator(function (doc) {
    if (doc.a + doc.b > 100) {
      return [{ name: 'b', type: 'sumTooLarge', value: doc.b, message: 'Sum exceeds 100' }];
    }
    return [];
  });
  schema.validate({ a: 50, b: 40 });
  try {
    schema.validate({ a: 60, b: 50 });
    test.fail();
  } catch (e) {
    test.equal(e.details[0].type, 'sumTooLarge');
  }
});

Tinytest.add('validate - modifier mode validates $set fields', function (test) {
  const schema = new MongoSchema({ name: String, age: { type: Number, min: 0 } });
  schema.validate({ $set: { name: 'Alice' } }, { modifier: true });
  test.ok();
  try {
    schema.validate({ $set: { age: -1 } }, { modifier: true });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.details[0].type, 'minNumber');
  }
});

Tinytest.add('validate - modifier mode validates $set type', function (test) {
  const schema = new MongoSchema({ name: String });
  try {
    schema.validate({ $set: { name: 123 } }, { modifier: true });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.details[0].type, 'expectedType');
  }
});

Tinytest.add('validate - modifier mode skips untouched fields', function (test) {
  const schema = new MongoSchema({ name: String, age: Number });
  schema.validate({ $set: { name: 'Alice' } }, { modifier: true });
  test.ok();
});

Tinytest.add('validate - modifier $unset is allowed', function (test) {
  const schema = new MongoSchema({ name: String, bio: { type: String, optional: true } });
  schema.validate({ $unset: { bio: '' } }, { modifier: true });
  test.ok();
});

Tinytest.add('validate - modifier $inc validates number type', function (test) {
  const schema = new MongoSchema({ count: { type: Number, min: 0 } });
  schema.validate({ $inc: { count: 1 } }, { modifier: true });
  test.ok();
});

Tinytest.add('validate - denyInsert rejects field on insert', function (test) {
  const schema = new MongoSchema({
    name: String,
    updatedAt: { type: Date, optional: true, denyInsert: true },
  });
  try {
    schema.validate({ name: 'Alice', updatedAt: new Date() }, { isInsert: true });
    test.fail('Should have thrown');
  } catch (e) {
    test.isTrue(e.details.some(d => d.name === 'updatedAt'));
  }
});

Tinytest.add('validate - denyUpdate rejects field on update', function (test) {
  const schema = new MongoSchema({
    name: String,
    createdAt: { type: Date, denyUpdate: true },
  });
  // Insert should work
  schema.validate({ name: 'Alice', createdAt: new Date() }, { isInsert: true });
  // Update modifier that touches createdAt should fail
  try {
    schema.validate({ $set: { createdAt: new Date() } }, { modifier: true, isUpdate: true });
    test.fail('Should have thrown');
  } catch (e) {
    test.isTrue(e.details.some(d => d.name === 'createdAt'));
  }
});
