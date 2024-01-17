# EJSON

EJSON is an extension of JSON to support more types. It supports all JSON-safe types, as well as:

- **Date** (JavaScript `Date`)
- **Binary** (JavaScript `Uint8Array` or the
  result of [`EJSON.newBinary`](#ejson_new_binary))
- **Special numbers** (JavaScript `NaN`, `Infinity`, and `-Infinity`)
- **Regular expressions** (JavaScript `RegExp`)
- **User-defined types** (see [`EJSON.addType`](#ejson_add_type). For example,
  [`Mongo.ObjectID`](#mongo_object_id) is implemented this way.)

All EJSON serializations are also valid JSON. For example an object with a date
and a binary buffer would be serialized in EJSON as:

```json
{
  "d": { "$date": 1358205756553 },
  "b": { "$binary": "c3VyZS4=" }
}
```

Meteor supports all built-in EJSON data types in publishers, method arguments
and results, Mongo databases, and [`Session`](#session) variables.

<ApiBox name="EJSON.parse" />

<ApiBox name="EJSON.stringify" hasCustomExample/>

```js
import { EJSON } from "meteor/ejson";

EJSON.stringify(
  { num: 42, someProp: "foo" },
  options // this param is optional
);
```

<ApiBox name="EJSON.fromJSONValue" />

<ApiBox name="EJSON.toJSONValue" />

<ApiBox name="EJSON.equals" />

<ApiBox name="EJSON.clone" />

<ApiBox name="EJSON.newBinary" />

Buffers of binary data are represented by `Uint8Array` instances on JavaScript
platforms that support them. On implementations of JavaScript that do not
support `Uint8Array`, binary data buffers are represented by standard arrays
containing numbers ranging from 0 to 255, and the `$Uint8ArrayPolyfill` key
set to `true`.

<ApiBox name="EJSON.isBinary" />

<ApiBox name="EJSON.addType"  hasCustomExample/>

The factory function passed to the `EJSON.addType` method should create an instance of our custom type and initialize it with values from an object passed as the first argument of the factory function. Here is an example:

```js
class Distance {
  constructor(value, unit) {
    this.value = value;
    this.unit = unit;
  }

  // Convert our type to JSON.
  toJSONValue() {
    return {
      value: this.value,
      unit: this.unit,
    };
  }

  // Unique type name.
  typeName() {
    return "Distance";
  }
}

EJSON.addType("Distance", function fromJSONValue(json) {
  return new Distance(json.value, json.unit);
});

EJSON.stringify(new Distance(10, "m"));
// Returns '{"$type":"Distance","$value":{"value":10,"unit":"m"}}'
```

When you add a type to EJSON, Meteor will be able to use that type in:

- publishing objects of your type if you pass them to publish handlers.
- allowing your type in the return values or arguments to
  [methods](#methods_header).
- storing your type client-side in Minimongo.
- allowing your type in [`Session`](#session) variables.

Instances of your type must implement [`typeName`](#ejson_type_typeName) and
[`toJSONValue`](#ejson_type_toJSONValue) methods, and may implement
[`clone`](#ejson_type_clone) and [`equals`](#ejson_type_equals) methods if the
default implementations are not sufficient.

<ApiBox name="EJSON.CustomType#typeName" hasCustomExample  instanceName="CustomType"/>
<ApiBox name="EJSON.CustomType#toJSONValue" hasCustomExample  instanceName="CustomType"/>

For example, the `toJSONValue` method for
[`Mongo.ObjectID`](#mongo_object_id) could be:

```js
function () {
  return this.toHexString();
}
```

<ApiBox name="EJSON.CustomType#clone" hasCustomExample  instanceName="CustomType"/>

If your type does not have a `clone` method, `EJSON.clone` will use
[`toJSONValue`](#ejson_type_toJSONValue) and the factory instead.

<ApiBox name="EJSON.CustomType#equals" hasCustomExample instanceName="CustomType"/>

The `equals` method should define an [equivalence
relation](http://en.wikipedia.org/wiki/Equivalence_relation). It should have
the following properties:

- _Reflexivity_ - for any instance `a`: `a.equals(a)` must be true.
- _Symmetry_ - for any two instances `a` and `b`: `a.equals(b)` if and only if `b.equals(a)`.
- _Transitivity_ - for any three instances `a`, `b`, and `c`: `a.equals(b)` and `b.equals(c)` implies `a.equals(c)`.

If your type does not have an `equals` method, `EJSON.equals` will compare the
result of calling [`toJSONValue`](#ejson_type_toJSONValue) instead.
