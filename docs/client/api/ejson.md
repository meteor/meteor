{{#template name="apiEjson"}}

<h2 id="ejson"><span>EJSON</span></h2>

EJSON is an extension of JSON to support more types. It supports all JSON-safe
types, as well as:

 - **Date** (JavaScript `Date`)
 - **Binary** (JavaScript `Uint8Array` or the
   result of [`EJSON.newBinary`](#ejson_new_binary))
 - **User-defined types** (see [`EJSON.addType`](#ejson_add_type).  For example,
 [`Mongo.ObjectID`](#mongo_object_id) is implemented this way.)

All EJSON serializations are also valid JSON.  For example an object with a date
and a binary buffer would be serialized in EJSON as:

    {
      "d": {"$date": 1358205756553},
      "b": {"$binary": "c3VyZS4="}
    }

Meteor supports all built-in EJSON data types in publishers, method arguments
and results, Mongo databases, and [`Session`](#session) variables.

{{> autoApiBox "EJSON.parse"}}

{{> autoApiBox "EJSON.stringify"}}

{{> autoApiBox "EJSON.fromJSONValue"}}

{{> autoApiBox "EJSON.toJSONValue"}}

{{> autoApiBox "EJSON.equals"}}

{{> autoApiBox "EJSON.clone"}}

{{> autoApiBox "EJSON.newBinary"}}

Buffers of binary data are represented by `Uint8Array` instances on JavaScript
platforms that support them.  On implementations of JavaScript that do not
support `Uint8Array`, binary data buffers are represented by standard arrays
containing numbers ranging from 0 to 255, and the `$Uint8ArrayPolyfill` key
set to `true`.

{{> autoApiBox "EJSON.isBinary"}}

{{> autoApiBox "EJSON.addType"}}

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

{{> autoApiBox "EJSON.CustomType#typeName"}}
{{> autoApiBox "EJSON.CustomType#toJSONValue"}}

For example, the `toJSONValue` method for
[`Mongo.ObjectID`](#mongo_object_id) could be:

    function () {
      return this.toHexString();
    };

{{> autoApiBox "EJSON.CustomType#clone"}}

If your type does not have a `clone` method, `EJSON.clone` will use
[`toJSONValue`](#ejson_type_toJSONValue) and the factory instead.

{{> autoApiBox "EJSON.CustomType#equals"}}

The `equals` method should define an [equivalence
relation](http://en.wikipedia.org/wiki/Equivalence_relation).  It should have
the following properties:

 - *Reflexivity* - for any instance `a`: `a.equals(a)` must be true.
 - *Symmetry* - for any two instances `a` and `b`: `a.equals(b)` if and only if `b.equals(a)`.
 - *Transitivity* - for any three instances `a`, `b`, and `c`: `a.equals(b)` and `b.equals(c)` implies `a.equals(c)`.

If your type does not have an `equals` method, `EJSON.equals` will compare the
result of calling [`toJSONValue`](#ejson_type_toJSONValue) instead.

{{/template}}