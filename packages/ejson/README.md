# ejson
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/ejson) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/ejson)
***

EJSON is an extension of JSON to support more types. It supports all JSON-safe
types, as well as:

 - **Date** - JavaScript `Date`
 - **Binary** - JavaScript `Uint8Array` or the
   result of [`EJSON.newBinary`](http://docs.meteor.com/#ejson_new_binary)
 - **User-defined types** - see [`EJSON.addType`](http://docs.meteor.com/#ejson_add_type)

All EJSON serializations are also valid JSON.  For example an object with a date
and a binary buffer would be serialized in EJSON as:

    {
      "d": {"$date": 1358205756553},
      "b": {"$binary": "c3VyZS4="}
    }

For more details, see the [EJSON section](http://docs.meteor.com/#ejson) of the Meteor docs.