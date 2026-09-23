# mongo-schema
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/mongo-schema) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/mongo-schema)
***

Native schema validation for MongoDB collections in Meteor. A drop-in replacement for `simpl-schema` + `aldeed:collection2` that compiles schemas to MongoDB's `$jsonSchema` for optional database-level enforcement.

## Quick Start

```js
import { MongoSchema, ValidationError } from 'meteor/mongo-schema';
import { Mongo } from 'meteor/mongo';

const Tasks = new Mongo.Collection('tasks');

const TaskSchema = new MongoSchema({
  title: { type: String, min: 1, max: 200 },
  completed: { type: Boolean, defaultValue: false },
  assignee: { type: String, optional: true },
  tags: { type: Array, optional: true },
  'tags.$': { type: String },
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) return new Date();
    },
  },
});

Tasks.attachSchema(TaskSchema);

// Automatically validates, cleans (trims strings, applies defaults), and
// enforces the schema on every insert, update, and upsert.
await Tasks.insertAsync({ title: 'Write docs' });
// => { title: 'Write docs', completed: false, createdAt: Date }

await Tasks.insertAsync({});
// => throws ValidationError: "Title is required [validation-error]"
```

## Installation

`mongo-schema` is a core Meteor package. Add it with:

```bash
meteor add mongo-schema
```

## Schema Definition

Fields are defined as an object mapping field names to definitions. Each field can be specified in full form or shorthand.

### Full Form

```js
const schema = new MongoSchema({
  name: { type: String },
  age: { type: Number, optional: true, min: 0, max: 150 },
  status: { type: String, allowedValues: ['active', 'inactive'] },
  email: { type: String, regEx: /^.+@.+\..+$/ },
  score: { type: MongoSchema.Integer },
  metadata: { type: Object, blackbox: true },
});
```

### Shorthand Forms

```js
const schema = new MongoSchema({
  name: String,              // same as { type: String }
  count: Number,             // same as { type: Number }
  phone: /^\d{10}$/,         // same as { type: String, regEx: /^\d{10}$/ }
  tags: [String],            // same as tags: { type: Array }, 'tags.$': { type: String }
});
```

### Supported Types

| Type | Description |
|------|-------------|
| `String` | JavaScript string |
| `Number` | Any number (not NaN) |
| `Boolean` | `true` or `false` |
| `Date` | Valid JavaScript Date |
| `Object` | Plain object (not array, not null, not Date) |
| `Array` | JavaScript array |
| `MongoSchema.Integer` | Integer only (no decimals) |
| `MongoSchema.Any` | Any value (skips type checking) |
| `MongoSchema.oneOf(A, B)` | Union type: value must match at least one |

### Nested Objects & Arrays

Use dot notation to define fields inside objects and arrays:

```js
const schema = new MongoSchema({
  address: { type: Object },
  'address.street': { type: String },
  'address.city': { type: String },
  'address.zip': { type: String, optional: true },

  contacts: { type: Array },
  'contacts.$': { type: Object },
  'contacts.$.name': { type: String },
  'contacts.$.email': { type: String, optional: true },
});
```

### Field Options

| Option | Type | Description |
|--------|------|-------------|
| `type` | Constructor/Marker | **Required.** The field's type |
| `optional` | `Boolean` | If `true`, field is not required (default: `false`) |
| `required` | `Boolean` | Explicit required flag (overrides `optional`) |
| `defaultValue` | any | Applied during `clean()` when the field is missing |
| `autoValue` | `Function` | Computed value function (see [AutoValues](#autovalues)) |
| `min` | `Number` | Minimum value (numbers), minimum length (strings) |
| `max` | `Number` | Maximum value (numbers), maximum length (strings) |
| `exclusiveMin` | `Boolean` | If `true`, `min` is exclusive |
| `exclusiveMax` | `Boolean` | If `true`, `max` is exclusive |
| `allowedValues` | `Array` | Whitelist of allowed values |
| `regEx` | `RegExp` or `[RegExp]` | Value must match at least one pattern |
| `minCount` | `Number` | Minimum array length |
| `maxCount` | `Number` | Maximum array length |
| `blackbox` | `Boolean` | If `true`, skip validation of nested fields |
| `trim` | `Boolean` | Per-field override for string trimming (default: `true`) |
| `label` | `String` | Human-readable label for error messages |
| `custom` | `Function` | Custom validation function (see [Custom Validators](#custom-validators)) |
| `denyInsert` | `Boolean` | Reject field on insert operations |
| `denyUpdate` | `Boolean` | Reject field on update operations |

### Constructor Options

```js
const schema = new MongoSchema(definition, {
  requiredByDefault: true,     // default: true (all fields required unless optional: true)
  humanizeAutoLabels: true,    // default: true (auto-generate labels from field names)
  clean: {
    filter: true,              // remove unknown fields
    autoConvert: true,         // convert "25" to 25 for Number fields, etc.
    removeEmptyStrings: true,  // delete empty string values
    trimStrings: true,         // trim whitespace from strings
    getAutoValues: true,       // run defaultValue and autoValue
  },
});
```

## AutoValues

AutoValue functions run during `clean()` and receive a context object via `this`:

```js
const schema = new MongoSchema({
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
  updatedAt: {
    type: Date,
    optional: true,
    autoValue() {
      return new Date();
    },
  },
  createdBy: {
    type: String,
    autoValue() {
      if (this.isInsert) return this.userId;
    },
  },
});
```

### AutoValue Context

| Property/Method | Description |
|-----------------|-------------|
| `this.value` | Current field value |
| `this.isSet` | `true` if the field has a value |
| `this.key` | Full dot-notation field path |
| `this.operator` | MongoDB operator if in modifier mode (`$set`, `$inc`, etc.), or `null` |
| `this.isInsert` | `true` during insert |
| `this.isUpdate` | `true` during update |
| `this.isUpsert` | `true` during upsert |
| `this.userId` | Current user ID (from `Meteor.userId()`) |
| `this.isFromTrustedCode` | `true` on server, `false` on client |
| `this.field(name)` | Returns `{ isSet, value, operator }` for another field |
| `this.siblingField(name)` | Same as `field()`, relative to parent path |
| `this.parentField()` | Returns the parent object |
| `this.unset()` | Remove this field from the document |

Return a value to set the field. Return `undefined` (or nothing) to leave it unchanged. Call `this.unset()` to remove it.

## Validation

### Direct Validation

```js
const schema = new MongoSchema({ name: String, age: Number });

// Throws ValidationError if invalid
schema.validate({ name: 'Alice', age: 25 });

// Partial validation — only check specific keys
schema.validate({ name: 'Alice' }, { keys: ['name'] });

// Ignore specific error types
schema.validate({ name: 'A' }, { ignore: ['minString'] });

// Validate a modifier
schema.validate({ $set: { name: 'Alice' } }, { modifier: true });
```

### ValidationContext (Reactive)

For forms and reactive UI, use a validation context:

```js
const schema = new MongoSchema({ name: String, email: String });
const ctx = schema.newContext();

ctx.validate({ name: 'Alice' }); // returns false (email missing)
ctx.isValid();                   // false (reactive)
ctx.keyIsInvalid('email');       // true (reactive)
ctx.keyErrorMessage('email');    // "Email is required"
ctx.validationErrors();          // [{ name: 'email', type: 'required', ... }]

// Named contexts (cached per name, useful for forms)
const formCtx = schema.namedContext('insertForm');
```

`isValid()`, `keyIsInvalid()`, `keyErrorMessage()`, and `validationErrors()` are reactive when `Tracker` is available (client-side).

### Custom Validators

#### Per-Field

```js
const schema = new MongoSchema({
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
```

Return a string error type to fail validation. Return nothing to pass.

#### Per-Schema

```js
schema.addValidator(function () {
  // `this` has the same context as per-field custom validators
  // Called once per field during validation
  if (this.key === 'name' && this.value === 'forbidden') {
    return 'notAllowed';
  }
});

schema.addDocValidator(function (doc) {
  // Called once per document. Return an array of error objects.
  if (doc.a + doc.b > 100) {
    return [{ name: 'b', type: 'sumTooLarge', value: doc.b, message: 'Sum exceeds 100' }];
  }
  return [];
});
```

#### Global

```js
MongoSchema.addValidator(fn);     // runs on all schemas
MongoSchema.addDocValidator(fn);  // runs on all schemas
```

### ValidationError

Thrown by `validate()` and collection mutation methods. Extends `Meteor.Error` for DDP transport.

```js
try {
  schema.validate({});
} catch (e) {
  e.error;    // 'validation-error'
  e.details;  // [{ name: 'fieldName', type: 'required', value: undefined, message: '...' }]
  e.message;  // 'Field is required [validation-error]'
}
```

### Error Types

| Constant | Value | Meaning |
|----------|-------|---------|
| `MongoSchema.ErrorTypes.REQUIRED` | `'required'` | Missing required field |
| `MongoSchema.ErrorTypes.EXPECTED_TYPE` | `'expectedType'` | Wrong type |
| `MongoSchema.ErrorTypes.MIN_STRING` | `'minString'` | String too short |
| `MongoSchema.ErrorTypes.MAX_STRING` | `'maxString'` | String too long |
| `MongoSchema.ErrorTypes.MIN_NUMBER` | `'minNumber'` | Number too small |
| `MongoSchema.ErrorTypes.MAX_NUMBER` | `'maxNumber'` | Number too large |
| `MongoSchema.ErrorTypes.MIN_NUMBER_EXCLUSIVE` | `'minNumberExclusive'` | Number at or below exclusive min |
| `MongoSchema.ErrorTypes.MAX_NUMBER_EXCLUSIVE` | `'maxNumberExclusive'` | Number at or above exclusive max |
| `MongoSchema.ErrorTypes.MIN_DATE` | `'minDate'` | Date too early |
| `MongoSchema.ErrorTypes.MAX_DATE` | `'maxDate'` | Date too late |
| `MongoSchema.ErrorTypes.BAD_DATE` | `'badDate'` | Invalid Date object |
| `MongoSchema.ErrorTypes.MIN_COUNT` | `'minCount'` | Array too short |
| `MongoSchema.ErrorTypes.MAX_COUNT` | `'maxCount'` | Array too long |
| `MongoSchema.ErrorTypes.MUST_BE_INTEGER` | `'noDecimal'` | Expected integer, got decimal |
| `MongoSchema.ErrorTypes.VALUE_NOT_ALLOWED` | `'notAllowed'` | Value not in allowedValues |
| `MongoSchema.ErrorTypes.FAILED_REGULAR_EXPRESSION` | `'regEx'` | Failed regex match |
| `MongoSchema.ErrorTypes.KEY_NOT_IN_SCHEMA` | `'keyNotInSchema'` | Unknown field |

## Clean Pipeline

`schema.clean()` transforms a document through a configurable pipeline:

```js
const schema = new MongoSchema({
  name: String,
  age: Number,
  active: { type: Boolean, defaultValue: true },
});

const result = schema.clean({
  name: '  Alice  ',
  age: '25',
  extra: 'unknown',
});
// => { name: 'Alice', age: 25, active: true }
//    - trimmed whitespace
//    - converted '25' to 25
//    - applied defaultValue
//    - filtered unknown 'extra' key
```

### Pipeline Stages (in order)

1. **filter** — remove keys not in the schema (`_id` is always preserved)
2. **autoConvert** — coerce types (string to number, string to boolean, etc.)
3. **removeEmptyStrings** — delete fields with value `''`
4. **removeNullsFromArrays** — filter `null` values from arrays
5. **trimStrings** — trim whitespace (respects per-field `trim: false`)
6. **defaultValue** — apply `defaultValue` for missing fields
7. **autoValue** — run `autoValue` functions

### Options

```js
schema.clean(doc, {
  mutate: false,              // default: false (returns clone; true modifies in place)
  filter: true,               // override schema default
  autoConvert: true,
  removeEmptyStrings: true,
  removeNullsFromArrays: false,
  trimStrings: true,
  getAutoValues: true,        // controls both defaultValue and autoValue
  isModifier: false,          // true to clean a MongoDB modifier ($set, $inc, etc.)
  extendAutoValueContext: {},  // extra properties for autoValue's `this`
});
```

## Collection Integration

### attachSchema

```js
const Posts = new Mongo.Collection('posts');

Posts.attachSchema(new MongoSchema({
  title: { type: String, max: 200 },
  body: String,
}));

// Calling again merges schemas (or pass { replace: true } to replace)
Posts.attachSchema(new MongoSchema({
  tags: { type: Array, optional: true },
  'tags.$': String,
}));
```

Once attached, `insertAsync`, `updateAsync`, and `upsertAsync` automatically run the clean pipeline and validate before executing. `removeAsync` passes through without validation.

### Bypassing Validation

```js
// Skip validation but still run clean
await Posts.insertAsync({ title: 'Draft' }, { validate: false });

// Skip everything (server-only, ignored on client)
await Posts.insertAsync({ anything: 'goes' }, { bypassSchema: true });
```

### Accessing the Schema

```js
Posts.schema();                    // returns the MongoSchema instance (or null)
Posts.schemaEnforcedOnDatabase();  // true if $jsonSchema was applied to MongoDB
```

## Database Enforcement

Opt-in to apply the schema as a MongoDB `$jsonSchema` validator at the database level:

```js
Posts.attachSchema(schema, {
  enforceOnDatabase: true,
  validationLevel: 'moderate',   // 'off' | 'moderate' | 'strict' (default: 'moderate')
  validationAction: 'error',     // 'error' | 'warn' (default: 'error')
});
```

This compiles the schema to `$jsonSchema` and applies it via `collMod` at server startup. A `_meteor_schema_versions` collection tracks schema hashes to avoid reapplying unchanged schemas.

Database enforcement provides a safety net but cannot enforce `autoValue`, `defaultValue`, `custom` validators, or application-level logic. These are handled by the application-level pipeline.

## Schema Composition

```js
const base = new MongoSchema({ name: String, email: String });
const extra = new MongoSchema({ age: Number });

// Merge — latter wins on conflicts
const merged = base.extend(extra);

// Subset
const nameOnly = base.pick('name');

// Exclude fields
const noEmail = base.omit('email');

// Extract nested object as standalone schema
const fullSchema = new MongoSchema({
  address: { type: Object },
  'address.city': String,
  'address.zip': String,
});
const addressSchema = fullSchema.getObjectSchema('address');
// => MongoSchema({ city: String, zip: String })
```

## Schema Accessors

```js
schema.schema();              // returns the raw definition object
schema.schema('name');        // returns the raw definition for a specific field
schema.get('name', 'max');    // returns a specific property from a field's definition
schema.label('name');         // returns the resolved label
schema.defaultValue('active');// returns the defaultValue
schema.getAllowedValuesForKey('status'); // returns the allowedValues array

// Bulk-set labels
schema.labels({ name: 'Full Name', email: 'Email Address' });
```

## JSON Schema Compilation

Convert a schema to MongoDB's `$jsonSchema` format:

```js
const jsonSchema = schema.toJsonSchema();
// => { bsonType: 'object', required: [...], properties: { ... } }
```

This is used internally by database enforcement but can also be used standalone for debugging or applying to collections manually.

## Migrating from SimpleSchema + Collection2

`MongoSchema` is designed as a near drop-in replacement. Key differences:

| SimpleSchema / Collection2 | MongoSchema | Notes |
|---------------------------|-------------|-------|
| `new SimpleSchema({...})` | `new MongoSchema({...})` | Same definition syntax |
| `import SimpleSchema from 'simpl-schema'` | `import { MongoSchema } from 'meteor/mongo-schema'` | |
| `collection.attachSchema(schema)` | `collection.attachSchema(schema)` | Same API |
| `SimpleSchema.Integer` | `MongoSchema.Integer` | |
| `SimpleSchema.oneOf()` | `MongoSchema.oneOf()` | |
| `e.invalidKeys()` | `e.details` | Array of `{ name, type, value, message }` |
| `SimpleSchema.RegEx.Email` | Use a regex directly | Built-in regex patterns removed |
| `SimpleSchema.debug = true` | Removed | |
| `aldeed:schema-index` | Not supported (v1) | |
| `selector` option | Not supported (v1) | |
| `transform` option | Not supported (v1) | |

### Migration Example

Before (SimpleSchema + Collection2):
```js
import SimpleSchema from 'simpl-schema';

const ChatFilesSchema = new SimpleSchema({
  fileName: { type: String },
  fileSize: { type: Number },
  void: { type: Boolean, defaultValue: false, optional: true },
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) return new Date();
    },
  },
});

ChatFiles.attachSchema(ChatFilesSchema);
```

After (MongoSchema):
```js
import { MongoSchema } from 'meteor/mongo-schema';

const ChatFilesSchema = new MongoSchema({
  fileName: { type: String },
  fileSize: { type: Number },
  void: { type: Boolean, defaultValue: false, optional: true },
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) return new Date();
    },
  },
});

ChatFiles.attachSchema(ChatFilesSchema);
```

The schema definition is identical. Only the import changes.
