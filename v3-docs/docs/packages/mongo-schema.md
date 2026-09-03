# mongo-schema

The `mongo-schema` package provides native schema validation for MongoDB collections in Meteor.
Define a schema once, attach it to a collection, and every `insertAsync`, `updateAsync`, and
`upsertAsync` call is automatically cleaned and validated — no extra wiring required.

Key capabilities:

- **Declarative schemas** — define field types, constraints, defaults, and auto-values in a single object
- **Automatic cleaning** — type coercion, trimming, filtering unknown fields, and applying defaults
- **Validation** — required checks, type checks, min/max, regex, allowed values, and custom validators
- **Collection integration** — attach a schema and mutations are cleaned + validated transparently
- **Database enforcement** — optionally compile to MongoDB `$jsonSchema` for server-side validation
- **Reactive validation contexts** — wire form errors into Blaze or any reactive UI layer
- **Drop-in replacement** for `SimpleSchema` + `aldeed:collection2` — same definition syntax, smaller footprint

## Installation {#installation}

To add this package to an existing app:

```bash
meteor add mongo-schema
```

To use in a package:

```js
Package.onUse((api) => {
  api.use('mongo-schema');
});
```

Then import the classes you need:

```js
import { MongoSchema, ValidationError } from 'meteor/mongo-schema';
```

## Quick Start {#quick-start}

Here is a complete example that defines a schema, attaches it to a collection, and inserts a document:

```js
import { Mongo } from 'meteor/mongo';
import { MongoSchema } from 'meteor/mongo-schema';

const Posts = new Mongo.Collection('posts');

const PostSchema = new MongoSchema({
  title:     { type: String, min: 1, max: 200 },
  body:      String,
  tags:      { type: [String], optional: true },
  status:    { type: String, allowedValues: ['draft', 'published'] },
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert && !this.isSet) return new Date();
    },
  },
});

Posts.attachSchema(PostSchema);

// This document is automatically cleaned (trimmed, defaults applied)
// and validated before it reaches MongoDB:
await Posts.insertAsync({
  title: '  Hello World  ',
  body: 'My first post',
  status: 'draft',
});
// Inserted as: { title: 'Hello World', body: 'My first post',
//                status: 'draft', createdAt: Date(...) }

// This will throw a ValidationError because 'title' is required:
await Posts.insertAsync({ body: 'No title' });
// => ValidationError: "Title is required"
```

## Defining Schemas {#defining-schemas}

<ApiBox name="MongoSchema" hasCustomExample/>

A schema is a plain object mapping field paths to field definitions. Each field definition describes the type, constraints, and behavior for that field.

### Shorthand Syntax {#shorthand-syntax}

`MongoSchema` supports several shorthand forms so that simple schemas stay concise:

```js
const schema = new MongoSchema({
  // Bare constructor — equivalent to { type: String }
  name: String,

  // RegExp shorthand — equivalent to { type: String, regEx: /^\d{10}$/ }
  phone: /^\d{10}$/,

  // Array shorthand — equivalent to defining type: Array + 'tags.$': { type: String }
  tags: [String],

  // Full form with constraints
  age: { type: Number, min: 0, max: 150, optional: true },
});
```

### Supported Types {#supported-types}

| Type | Description |
|------|-------------|
| `String` | JavaScript string |
| `Number` | JavaScript number (no `NaN`) |
| `Boolean` | `true` or `false` |
| `Date` | JavaScript `Date` (must be valid) |
| `Object` | Plain object |
| `Array` | JavaScript array |
| `MongoSchema.Integer` | Whole numbers only (no fractional part) |
| `MongoSchema.Any` | Any value — skipped in `$jsonSchema` |
| `MongoSchema.oneOf(A, B, ...)` | Union — value must match at least one |
| Custom constructor | Validated via `instanceof` |

### Field Options {#field-options}

Each field definition can include the following options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | Function/Object | *required* | The field type (see table above) |
| `optional` | Boolean | `false` | If `true`, the field is not required |
| `required` | Boolean | — | Overrides `optional` and `requiredByDefault` |
| `defaultValue` | any | — | Applied during cleaning when the field is missing |
| `autoValue` | Function | — | Computed value function (see [Auto Values](#auto-values)) |
| `min` | Number/Date | — | Minimum value, string length, or earliest date |
| `max` | Number/Date | — | Maximum value, string length, or latest date |
| `exclusiveMin` | Boolean | `false` | Make the `min` bound exclusive (`>` not `>=`) |
| `exclusiveMax` | Boolean | `false` | Make the `max` bound exclusive (`<` not `<=`) |
| `allowedValues` | Array/Set | — | Whitelist of permitted values |
| `regEx` | RegExp/RegExp[] | — | Pattern(s) the string value must match |
| `minCount` | Number | — | Minimum number of array items |
| `maxCount` | Number | — | Maximum number of array items |
| `blackbox` | Boolean | `false` | Skip validation of nested object contents |
| `trim` | Boolean | `true` | Set to `false` to skip trimming for this field |
| `label` | String | auto | Human-readable label for error messages |
| `custom` | Function | — | Custom validator (return error type string or `undefined`) |
| `denyInsert` | Boolean | `false` | Reject this field on insert |
| `denyUpdate` | Boolean | `false` | Reject this field on update |

### Nested Fields and Arrays {#nested-fields}

Use dot notation to define nested object fields. Use `.$` to define array item schemas:

```js
const OrderSchema = new MongoSchema({
  // Nested object fields
  'customer.name': String,
  'customer.email': { type: String, regEx: /^.+@.+\..+$/ },

  // Array of objects
  items:          { type: Array, minCount: 1 },
  'items.$':      { type: Object },
  'items.$.name': String,
  'items.$.qty':  { type: MongoSchema.Integer, min: 1 },
  'items.$.price': Number,

  // Simple array
  tags: [String],
});
```

### Constructor Options {#constructor-options}

The second argument to `new MongoSchema()` configures schema-level behavior:

```js
const schema = new MongoSchema(definition, {
  requiredByDefault: true,     // Fields are required unless optional: true (default)
  humanizeAutoLabels: true,    // Auto-generate labels from keys (default)
  clean: {
    filter: true,              // Remove unknown fields (default)
    autoConvert: true,         // Type coercion (default)
    removeEmptyStrings: true,  // Delete "" values (default)
    trimStrings: true,         // Trim whitespace (default)
    getAutoValues: true,       // Apply defaults and autoValues (default)
  },
});
```

## Cleaning Documents {#cleaning}

Cleaning transforms a raw document to conform to the schema. The cleaning pipeline
runs automatically when you use collection methods with an attached schema, but you
can also call it manually.

<ApiBox name="MongoSchema#clean" hasCustomExample/>

The pipeline runs these steps in order:

1. **Filter** — remove keys not defined in the schema (always keeps `_id`)
2. **Auto-convert** — coerce types (string→number, string→boolean, string→date, number→string)
3. **Remove empty strings** — delete fields with `""` values
4. **Remove nulls from arrays** — filter out `null` entries
5. **Trim strings** — trim leading/trailing whitespace (respects `trim: false` per field)
6. **Defaults** — apply `defaultValue` for missing fields
7. **Auto values** — run `autoValue` functions

```js
const schema = new MongoSchema({
  name:  { type: String, defaultValue: 'Anonymous' },
  age:   Number,
  score: { type: Number, optional: true },
});

schema.clean({ name: '  Alice  ', age: '30', extra: true });
// => { name: 'Alice', age: 30 }
//    - 'extra' was filtered out
//    - 'Alice' was trimmed
//    - '30' was converted to number 30

schema.clean({});
// => { name: 'Anonymous' }
//    - defaultValue was applied
```

You can also clean MongoDB update modifiers:

```js
schema.clean(
  { $set: { name: '  Bob  ' } },
  { isModifier: true }
);
// => { $set: { name: 'Bob' } }
```

Override cleaning options per call:

```js
schema.clean(doc, {
  filter: false,           // keep unknown fields
  trimStrings: false,      // don't trim
  getAutoValues: false,    // skip defaults and autoValues
  mutate: true,            // modify the original object instead of cloning
});
```

### Auto Values {#auto-values}

The `autoValue` function runs during cleaning and receives a rich context as `this`:

```js
const schema = new MongoSchema({
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert && !this.isSet) {
        return new Date();
      }
    },
  },
  updatedAt: {
    type: Date,
    autoValue() {
      return new Date();  // always set
    },
  },
});
```

**Context properties available in `autoValue`:**

| Property | Type | Description |
|----------|------|-------------|
| `this.key` | String | Full dot-path of the field |
| `this.genericKey` | String | Key with numeric indices replaced by `$` |
| `this.value` | any | Current field value |
| `this.isSet` | Boolean | Whether the field has a value |
| `this.operator` | String/null | MongoDB operator (`'$set'`, etc.) or `null` for plain docs |
| `this.isInsert` | Boolean | `true` during insert operations |
| `this.isUpdate` | Boolean | `true` during update operations |
| `this.isUpsert` | Boolean | `true` during upsert operations |
| `this.userId` | String/null | Current user ID (from collection integration) |
| `this.isFromTrustedCode` | Boolean | `true` when running on the server |
| `this.field(name)` | Function | Look up another field: returns `{ isSet, value, operator }` |
| `this.siblingField(name)` | Function | Look up a sibling field by local name |
| `this.parentField()` | Function | Access the parent object |
| `this.unset()` | Function | Remove this field from the document |

The return value determines what happens:

- **Return a value** — sets the field to that value
- **Return `undefined`** — no change
- **Call `this.unset()`** — removes the field

## Validation {#validation}

<ApiBox name="MongoSchema#validate" hasCustomExample/>

`validate()` checks the document against all schema rules and throws a `ValidationError`
if any field fails. The error contains structured details about every failing field.

```js
const schema = new MongoSchema({
  name:  { type: String, min: 1 },
  email: { type: String, regEx: /^.+@.+\..+$/ },
  age:   { type: Number, min: 0, optional: true },
});

// Passes
schema.validate({ name: 'Alice', email: 'alice@example.com' });

// Throws ValidationError
try {
  schema.validate({ name: '', email: 'not-an-email' });
} catch (err) {
  console.log(err.details);
  // [
  //   { name: 'name', type: 'minString', value: '', message: 'Name must be at least 1 characters' },
  //   { name: 'email', type: 'regEx', value: 'not-an-email', message: 'Email failed regular expression validation' },
  // ]
}
```

You can validate modifiers and control which errors to report:

```js
// Validate a modifier
schema.validate({ $set: { age: 25 } }, { modifier: true });

// Skip required-field errors
schema.validate(doc, { ignore: [MongoSchema.ErrorTypes.REQUIRED] });

// Only validate specific fields
schema.validate(doc, { keys: ['name', 'email'] });
```

### ValidationError {#validation-error}

`ValidationError` extends `Meteor.Error` (for DDP transport) with error code `'validation-error'`.
It is compatible with the `mdg:validation-error` contract.

```js
import { ValidationError } from 'meteor/mongo-schema';

try {
  schema.validate(doc);
} catch (err) {
  if (err instanceof ValidationError) {
    err.error;    // 'validation-error'
    err.details;  // Array of { name, type, value, message }
    err.message;  // Message from the first error
  }
}
```

### Reactive Validation Contexts {#validation-contexts}

Validation contexts collect errors without throwing, making them ideal for form validation.
They integrate with Meteor's Tracker for reactive error display.

<ApiBox name="MongoSchema#newContext" />

<ApiBox name="MongoSchema#namedContext" hasCustomExample/>

```js
const schema = new MongoSchema({
  name:  { type: String, min: 1 },
  email: { type: String, regEx: /^.+@.+\..+$/ },
});

const ctx = schema.newContext();

// validate() returns a boolean — does not throw
const isValid = ctx.validate({ name: '', email: 'bad' });
// => false

// Inspect errors
ctx.isValid();              // false (reactive)
ctx.validationErrors();     // [{ name: 'name', ... }, { name: 'email', ... }]
ctx.keyIsInvalid('name');   // true (reactive)
ctx.keyErrorMessage('name');// 'Name must be at least 1 characters' (reactive)

// Fix the data and re-validate
ctx.validate({ name: 'Alice', email: 'alice@example.com' });
ctx.isValid();              // true
```

Named contexts are cached on the schema instance — calling `namedContext('form')` twice
returns the same context, preserving its error state:

```js
const ctx = schema.namedContext('editForm');
ctx.validate(formData);
// Later:
schema.namedContext('editForm').isValid(); // same context
```

**ValidationContext methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `validate(doc, options)` | Boolean | Validate without throwing. Stores errors. |
| `isValid()` | Boolean | `true` if the last validation passed. Reactive. |
| `validationErrors()` | Array | All error details from the last validation. Reactive. |
| `keyIsInvalid(key)` | Boolean | `true` if the specified field has an error. Reactive. |
| `keyErrorMessage(key)` | String | Error message for a field, or `''`. Reactive. |

## Collection Integration {#collection-integration}

The most common way to use `mongo-schema` is by attaching a schema to a collection.
Once attached, `insertAsync`, `updateAsync`, and `upsertAsync` automatically clean
and validate documents before they reach MongoDB.

<ApiBox name="Mongo.Collection#attachSchema" from="mongo-schema" instanceName="Collection" hasCustomExample/>

```js
import { Mongo } from 'meteor/mongo';
import { MongoSchema } from 'meteor/mongo-schema';

const Players = new Mongo.Collection('players');

Players.attachSchema(new MongoSchema({
  name:  { type: String, min: 1 },
  score: { type: Number, defaultValue: 0 },
  team:  { type: String, allowedValues: ['red', 'blue'] },
}));

// Insert — cleaned and validated automatically
await Players.insertAsync({ name: 'Alice', team: 'red' });
// Stored as: { name: 'Alice', score: 0, team: 'red' }

// Update — modifier is cleaned and validated
await Players.updateAsync(playerId, { $set: { score: 100 } });

// Invalid data throws ValidationError
await Players.insertAsync({ name: '' });
// => ValidationError: "Name must be at least 1 characters"
```

### Attach Options {#attach-options}

```js
// Merge with an existing schema (default behavior)
Players.attachSchema(extraFields);

// Replace the existing schema entirely
Players.attachSchema(newSchema, { replace: true });
```

### Mutation Method Options {#mutation-options}

You can control schema behavior per-operation by passing options to the mutation methods:

```js
// Skip validation but still clean
await Players.insertAsync(doc, { validate: false });

// Skip all schema processing (server only)
await Players.insertAsync(doc, { bypassSchema: true });

// Override cleaning options
await Players.insertAsync(doc, {
  filter: false,
  trimStrings: false,
  getAutoValues: false,
});
```

### Collection Helper Methods {#collection-helpers}

<ApiBox name="Mongo.Collection#schema" from="mongo-schema" instanceName="Collection"/>

<ApiBox name="Mongo.Collection#schemaEnforcedOnDatabase" from="mongo-schema" instanceName="Collection"/>

### Database-Level Enforcement {#database-enforcement}

You can optionally push the schema to MongoDB itself using the `$jsonSchema` validator.
This provides a second layer of protection at the database level, catching any writes
that bypass your application code.

```js
Players.attachSchema(schema, {
  enforceOnDatabase: true,        // Apply $jsonSchema via collMod
  validationLevel: 'moderate',    // 'off' | 'moderate' | 'strict'
  validationAction: 'error',      // 'error' | 'warn'
});
```

- **`validationLevel: 'moderate'`** (default) — only validates documents that already match the schema. Existing non-conforming documents are left alone.
- **`validationLevel: 'strict'`** — all inserts and updates must conform.
- **`validationAction: 'error'`** (default) — rejects non-conforming writes.
- **`validationAction: 'warn'`** — logs a warning but allows the write.

The schema is compiled to `$jsonSchema` via `toJsonSchema()` and applied using a `collMod`
command at server startup. Schema hashes are tracked in a `_meteor_schema_versions` collection
to avoid reapplying unchanged schemas.

::: warning
Database-level enforcement only covers what `$jsonSchema` can express — types,
required fields, string patterns, numeric ranges, and enum values. Application-level
features like `autoValue`, `defaultValue`, `custom` validators, and `denyInsert`/`denyUpdate`
are not enforced at the database level.
:::

<ApiBox name="MongoSchema#toJsonSchema" />

## Schema Composition {#schema-composition}

Schemas can be combined, split, and extracted to promote reuse and keep definitions DRY.

<ApiBox name="MongoSchema#extend" hasCustomExample/>

```js
const TimestampSchema = new MongoSchema({
  createdAt: { type: Date, autoValue() { if (this.isInsert && !this.isSet) return new Date(); } },
  updatedAt: { type: Date, autoValue() { return new Date(); } },
});

const PostSchema = new MongoSchema({
  title: { type: String, min: 1 },
  body: String,
});

// Merge TimestampSchema into PostSchema
const FullPostSchema = PostSchema.extend(TimestampSchema);
```

<ApiBox name="MongoSchema#pick" hasCustomExample/>

```js
const NameAndEmail = UserSchema.pick('name', 'email');
// Only name and email fields; nested fields like 'name.first' are included
```

<ApiBox name="MongoSchema#omit" hasCustomExample/>

```js
const PublicUser = UserSchema.omit('password', 'loginTokens');
```

<ApiBox name="MongoSchema#getObjectSchema" hasCustomExample/>

```js
const fullSchema = new MongoSchema({
  'address.street': String,
  'address.city': String,
  'address.zip': { type: String, regEx: /^\d{5}$/ },
});

const addressSchema = fullSchema.getObjectSchema('address');
// => MongoSchema with { street: String, city: String, zip: ... }
```

## Custom Validators {#custom-validators}

Beyond the built-in checks, you can add custom validation logic at three levels:
per-field, per-schema, and globally.

### Per-Field Custom Validators {#per-field-custom}

Use the `custom` option in a field definition. The function receives the same context
as `autoValue` and should return an error type string to fail, or `undefined` to pass:

```js
const EventSchema = new MongoSchema({
  startDate: Date,
  endDate: {
    type: Date,
    custom() {
      const start = this.field('startDate');
      if (start.isSet && this.value <= start.value) {
        return 'endBeforeStart';  // custom error type
      }
    },
  },
});
```

### Schema-Level Validators {#schema-validators}

<ApiBox name="MongoSchema#addValidator" hasCustomExample/>

Per-field validators run for every top-level field. The function receives a
context as `this` (same shape as `custom`), and should return an error type string or `undefined`:

```js
schema.addValidator(function () {
  if (this.key === 'confirmPassword') {
    const password = this.field('password');
    if (password.isSet && this.value !== password.value) {
      return 'passwordMismatch';
    }
  }
});
```

<ApiBox name="MongoSchema#addDocValidator" hasCustomExample/>

Document validators receive the entire document and return an array of error detail objects:

```js
schema.addDocValidator((doc) => {
  const errors = [];
  if (doc.min > doc.max) {
    errors.push({
      name: 'min',
      type: 'minGreaterThanMax',
      value: doc.min,
      message: 'Min must not exceed max',
    });
  }
  return errors;
});
```

### Global Validators {#global-validators}

<ApiBox name="MongoSchema.addValidator" hasCustomExample/>

<ApiBox name="MongoSchema.addDocValidator" hasCustomExample/>

Global validators run on **every** `MongoSchema` instance. They follow the same signatures
as their instance counterparts:

```js
// Every schema will check that no field value is the literal string 'undefined'
MongoSchema.addValidator(function () {
  if (this.value === 'undefined') {
    return 'literalUndefinedString';
  }
});
```

## Introspection {#introspection}

These methods let you inspect a schema's definition at runtime — useful for building
dynamic forms, generating documentation, or debugging.

<ApiBox name="MongoSchema#schema" hasCustomExample/>

<ApiBox name="MongoSchema#get" hasCustomExample/>

<ApiBox name="MongoSchema#label" hasCustomExample/>

<ApiBox name="MongoSchema#labels" hasCustomExample/>

<ApiBox name="MongoSchema#defaultValue" hasCustomExample/>

<ApiBox name="MongoSchema#getAllowedValuesForKey" hasCustomExample/>

```js
const schema = new MongoSchema({
  role: { type: String, allowedValues: ['admin', 'user', 'guest'], label: 'User Role' },
  score: { type: Number, defaultValue: 0 },
});

schema.schema('role');                    // { type: String, allowedValues: [...], label: 'User Role' }
schema.schema();                          // entire definition object
schema.get('score', 'defaultValue');      // 0
schema.label('role');                     // 'User Role'
schema.defaultValue('score');             // 0
schema.getAllowedValuesForKey('role');     // ['admin', 'user', 'guest']

// Bulk-set labels
schema.labels({ role: 'Rol de Usuario', score: 'Puntuacion' });
```

## Error Types {#error-types}

All built-in validation error types are available as constants on `MongoSchema.ErrorTypes`:

| Constant | Value | Triggered when |
|----------|-------|----------------|
| `REQUIRED` | `'required'` | A required field is missing or `null` |
| `EXPECTED_TYPE` | `'expectedType'` | Value does not match the expected type |
| `MIN_STRING` | `'minString'` | String length is below `min` |
| `MAX_STRING` | `'maxString'` | String length exceeds `max` |
| `MIN_NUMBER` | `'minNumber'` | Number is below `min` |
| `MAX_NUMBER` | `'maxNumber'` | Number exceeds `max` |
| `MIN_NUMBER_EXCLUSIVE` | `'minNumberExclusive'` | Number is <= `min` with `exclusiveMin` |
| `MAX_NUMBER_EXCLUSIVE` | `'maxNumberExclusive'` | Number is >= `max` with `exclusiveMax` |
| `MIN_DATE` | `'minDate'` | Date is before `min` |
| `MAX_DATE` | `'maxDate'` | Date is after `max` |
| `BAD_DATE` | `'badDate'` | Value is a `Date` but invalid (`NaN`) |
| `MIN_COUNT` | `'minCount'` | Array has fewer than `minCount` items |
| `MAX_COUNT` | `'maxCount'` | Array has more than `maxCount` items |
| `MUST_BE_INTEGER` | `'noDecimal'` | Number has a fractional part but `Integer` expected |
| `VALUE_NOT_ALLOWED` | `'notAllowed'` | Value is not in `allowedValues` |
| `FAILED_REGULAR_EXPRESSION` | `'regEx'` | String does not match `regEx` pattern(s) |
| `KEY_NOT_IN_SCHEMA` | `'keyNotInSchema'` | Document contains a key not in the schema |
| `DENY_INSERT` | `'denyInsert'` | Field with `denyInsert: true` was set during insert |
| `DENY_UPDATE` | `'denyUpdate'` | Field with `denyUpdate: true` was set during update |

```js
import { MongoSchema } from 'meteor/mongo-schema';

// Use error types for conditional logic
try {
  schema.validate(doc);
} catch (err) {
  for (const detail of err.details) {
    if (detail.type === MongoSchema.ErrorTypes.REQUIRED) {
      console.log(`${detail.name} is missing`);
    }
  }
}

// Skip specific error types during validation
schema.validate(doc, {
  ignore: [MongoSchema.ErrorTypes.REQUIRED],
});
```

## Migrating from SimpleSchema & Collection2 {#migration}

`mongo-schema` is designed as a drop-in replacement for the `simpl-schema` npm package
and the `aldeed:collection2` Meteor package. If you are using those packages today,
migration is straightforward — the schema definition syntax is the same.

### Step-by-Step Migration {#migration-steps}

**1. Swap the packages**

```bash
# Remove the old packages
meteor remove aldeed:collection2
npm uninstall simpl-schema

# Add the new package
meteor add mongo-schema
```

**2. Update your imports**

```js
// Before
import SimpleSchema from 'simpl-schema';

// After
import { MongoSchema } from 'meteor/mongo-schema';
```

**3. Replace the constructor**

Schema definitions work the same — just change the class name:

```js
// Before
const schema = new SimpleSchema({
  name: { type: String, max: 100 },
  tags: { type: Array, optional: true },
  'tags.$': String,
});

// After — identical definition, different constructor
const schema = new MongoSchema({
  name: { type: String, max: 100 },
  tags: { type: Array, optional: true },
  'tags.$': String,
});
```

**4. Update collection attachment**

```js
// Before (Collection2)
Posts.attachSchema(schema);

// After — same API
Posts.attachSchema(schema);
```

**5. Update error handling**

```js
// Before (SimpleSchema)
try {
  schema.validate(doc);
} catch (err) {
  const errors = err.invalidKeys();   // SimpleSchema API
}

// After (MongoSchema)
try {
  schema.validate(doc);
} catch (err) {
  const errors = err.details;         // standard property
}
```

### API Mapping Table {#migration-table}

| SimpleSchema / Collection2 | mongo-schema | Notes |
|-----------------------------|--------------|-------|
| `new SimpleSchema({...})` | `new MongoSchema({...})` | Same definition syntax |
| `import SimpleSchema from 'simpl-schema'` | `import { MongoSchema } from 'meteor/mongo-schema'` | Named export |
| `SimpleSchema.Integer` | `MongoSchema.Integer` | Same behavior |
| `SimpleSchema.oneOf(A, B)` | `MongoSchema.oneOf(A, B)` | Same behavior |
| `SimpleSchema.ErrorTypes` | `MongoSchema.ErrorTypes` | Same constants |
| `schema.validate(doc)` | `schema.validate(doc)` | Same — throws on failure |
| `err.invalidKeys()` | `err.details` | Returns array of `{ name, type, value, message }` |
| `schema.clean(doc)` | `schema.clean(doc)` | Same signature and behavior |
| `schema.newContext()` | `schema.newContext()` | Same API |
| `schema.namedContext(name)` | `schema.namedContext(name)` | Same API |
| `ctx.validate(doc)` | `ctx.validate(doc)` | Returns boolean (same) |
| `ctx.isValid()` | `ctx.isValid()` | Reactive (same) |
| `ctx.validationErrors()` | `ctx.validationErrors()` | Same signature |
| `ctx.keyIsInvalid(key)` | `ctx.keyIsInvalid(key)` | Same |
| `ctx.keyErrorMessage(key)` | `ctx.keyErrorMessage(key)` | Same |
| `schema.extend(other)` | `schema.extend(other)` | Same — returns new schema |
| `schema.pick('a', 'b')` | `schema.pick('a', 'b')` | Same |
| `schema.omit('a', 'b')` | `schema.omit('a', 'b')` | Same |
| `schema.getObjectSchema(key)` | `schema.getObjectSchema(key)` | Same |
| `Collection.attachSchema(s)` | `Collection.attachSchema(s)` | Same (built-in) |
| `SimpleSchema.addValidator(fn)` | `MongoSchema.addValidator(fn)` | Same |
| `SimpleSchema.addDocValidator(fn)` | `MongoSchema.addDocValidator(fn)` | Same |
| `SimpleSchema.RegEx.Email` | Use a regex directly | Built-in patterns removed |
| `SimpleSchema.RegEx.Url` | Use a regex directly | Built-in patterns removed |
| `autoValue` with `this.isInsert` | Same context API | Same |
| `selector` option | Not yet supported | Planned for a future release |

### Migration Tips {#migration-tips}

- **Schema definitions are fully compatible.** All field options (`type`, `optional`, `min`, `max`, `allowedValues`, `regEx`, `autoValue`, `defaultValue`, `custom`, `blackbox`, `denyInsert`, `denyUpdate`, `trim`, `label`, `minCount`, `maxCount`) work identically.

- **Built-in regex patterns** like `SimpleSchema.RegEx.Email` are not included. Replace them with your own regex patterns:
  ```js
  // Before
  email: { type: String, regEx: SimpleSchema.RegEx.Email }

  // After
  email: { type: String, regEx: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/ }
  ```

- **Error handling** uses `err.details` instead of `err.invalidKeys()`. The objects in the array have the same structure (`name`, `type`, `value`) plus a `message` property.

- **Database enforcement** is a new feature not available in SimpleSchema/Collection2. Consider enabling it for critical collections:
  ```js
  Collection.attachSchema(schema, { enforceOnDatabase: true });
  ```

- **No separate package needed** for collection integration — `mongo-schema` includes it. Removing `aldeed:collection2` is all you need.
