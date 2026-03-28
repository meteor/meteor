// packages/mongo-schema/tests/migration_compat_tests.js
import { Tinytest } from 'meteor/tinytest';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { MongoSchema, ValidationError } from 'meteor/mongo-schema';

// Reproduce the exact schema from the user's example
Tinytest.addAsync('migration - ChatFiles schema works identically', async function (test) {
  const ChatFiles = new Mongo.Collection(Random.id());

  const ChatFilesSchema = new MongoSchema({
    conversationID: { type: String, optional: true },
    messageID: { type: String, optional: true },
    fileName: { type: String },
    fileType: { type: String },
    fileSize: { type: Number },
    fileData: { type: String },
    supplierID: { type: String, optional: true },
    retailerID: { type: String, optional: true },
    void: { type: Boolean, defaultValue: false, optional: true },
    aiGenerated: { type: Boolean, defaultValue: false, optional: true },
    aiToolName: { type: String, optional: true },
    createdAt: {
      type: Date,
      autoValue() {
        if (this.isInsert) {
          return new Date();
        } else if (this.isUpsert) {
          return { $setOnInsert: new Date() };
        }
      },
    },
    createdBy: {
      type: String,
      autoValue() {
        if (this.isInsert) {
          return this.userId;
        } else if (this.isUpsert) {
          return { $setOnInsert: this.userId };
        }
      },
    },
  });

  ChatFiles.attachSchema(ChatFilesSchema);

  // Insert a valid document
  const id = await ChatFiles.insertAsync({
    fileName: 'test.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
    fileData: 'base64data...',
  });

  const doc = await ChatFiles.findOneAsync(id);

  // Verify autoValues
  test.instanceOf(doc.createdAt, Date);
  // createdBy will be null in test context (no userId)
  test.equal(doc.void, false); // defaultValue
  test.equal(doc.aiGenerated, false); // defaultValue
  test.equal(doc.fileName, 'test.pdf');

  // Verify required fields are enforced
  try {
    await ChatFiles.insertAsync({
      fileName: 'test.pdf',
      // missing fileType, fileSize, fileData
    });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.error, 'validation-error');
  }
});

Tinytest.add('migration - schema.extend works', function (test) {
  const base = new MongoSchema({ name: String });
  const extra = new MongoSchema({ age: Number });
  const merged = base.extend(extra);
  merged.validate({ name: 'Alice', age: 25 });
  test.ok();
});

Tinytest.add('migration - schema.pick works', function (test) {
  const schema = new MongoSchema({ name: String, age: Number, email: String });
  const picked = schema.pick('name');
  picked.validate({ name: 'Alice' });
  test.ok();
});

Tinytest.add('migration - schema.omit works', function (test) {
  const schema = new MongoSchema({ name: String, age: Number });
  const omitted = schema.omit('age');
  omitted.validate({ name: 'Alice' });
  test.ok();
});

Tinytest.add('migration - newContext validate pattern', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx = schema.newContext();
  test.isTrue(ctx.validate({ name: 'Alice' }));
  test.isFalse(ctx.validate({}));
  test.isTrue(ctx.keyIsInvalid('name'));
  test.isTrue(ctx.keyErrorMessage('name').length > 0);
});

Tinytest.add('migration - namedContext pattern', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx = schema.namedContext('insertForm');
  ctx.validate({});
  test.isFalse(ctx.isValid());
  const errors = ctx.validationErrors();
  test.equal(errors.length, 1);
});

Tinytest.add('migration - clean with all options', function (test) {
  const schema = new MongoSchema({
    name: String,
    age: Number,
    active: { type: Boolean, defaultValue: true },
  });
  const result = schema.clean({
    name: '  Alice  ',
    age: '25',
    extra: 'removed',
  });
  test.equal(result.name, 'Alice');     // trimmed
  test.equal(result.age, 25);           // autoConverted
  test.equal(result.active, true);      // defaultValue
  test.equal(result.extra, undefined);  // filtered
});

Tinytest.add('migration - validate throws ValidationError', function (test) {
  const schema = new MongoSchema({ name: String });
  try {
    schema.validate({});
  } catch (e) {
    test.instanceOf(e, ValidationError);
    test.equal(e.error, 'validation-error');
    test.isTrue(Array.isArray(e.details));
    test.equal(e.details[0].name, 'name');
    test.equal(e.details[0].type, 'required');
  }
});

Tinytest.add('migration - ErrorTypes match SimpleSchema constants', function (test) {
  test.equal(MongoSchema.ErrorTypes.REQUIRED, 'required');
  test.equal(MongoSchema.ErrorTypes.EXPECTED_TYPE, 'expectedType');
  test.equal(MongoSchema.ErrorTypes.VALUE_NOT_ALLOWED, 'notAllowed');
  test.equal(MongoSchema.ErrorTypes.FAILED_REGULAR_EXPRESSION, 'regEx');
  test.equal(MongoSchema.ErrorTypes.MUST_BE_INTEGER, 'noDecimal');
  test.equal(MongoSchema.ErrorTypes.KEY_NOT_IN_SCHEMA, 'keyNotInSchema');
});

Tinytest.add('migration - toJsonSchema compiles', function (test) {
  const schema = new MongoSchema({
    name: { type: String, max: 100 },
    age: { type: Number, min: 0, optional: true },
    status: { type: String, allowedValues: ['active', 'inactive'] },
  });
  const js = schema.toJsonSchema();
  test.equal(js.bsonType, 'object');
  test.isTrue(js.required.includes('name'));
  test.isTrue(js.required.includes('status'));
  test.isFalse(js.required.includes('age'));
  test.equal(js.properties.name.maxLength, 100);
  test.equal(js.properties.age.minimum, 0);
  test.equal(js.properties.status.enum[0], 'active');
});
