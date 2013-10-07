Template.api.isClient = {
  id: "meteor_isclient",
  name: "Meteor.isClient",
  locus: "Anywhere",
  descr: ["Boolean variable.  True if running in client environment."]
};

Template.api.isServer = {
  id: "meteor_isserver",
  name: "Meteor.isServer",
  locus: "Anywhere",
  descr: ["Boolean variable.  True if running in server environment."]
};

Template.api.startup = {
  id: "meteor_startup",
  name: "Meteor.startup(func)",
  locus: "Anywhere",
  descr: ["Run code when a client or a server starts."],
  args: [
    {name: "func",
     type: "Function",
     descr: "A function to run on startup."}
  ]
};

Template.api.absoluteUrl = {
  id: "meteor_absoluteurl",
  name: "Meteor.absoluteUrl([path], [options])",
  locus: "Anywhere",
  descr: ["Generate an absolute URL pointing to the application. The server "
          + "reads from the `ROOT_URL` environment variable to determine "
          + "where it is running. This is taken care of automatically for "
          + "apps deployed with `meteor deploy`, but must be provided when "
          + "using `meteor bundle`."],
  args: [
    {name: "path",
     type: "String",
     descr: 'A path to append to the root URL. Do not include a leading "`/`".'
    }
  ],
  options: [
    {name: "secure",
     type: "Boolean",
     descr: "Create an HTTPS URL."
    },
    {name: "replaceLocalhost",
     type: "Boolean",
     descr: "Replace localhost with 127.0.0.1. Useful for services that don't recognize localhost as a domain name."},
    {name: "rootUrl",
     type: "String",
     descr: "Override the default ROOT_URL from the server environment. For example: \"`http://foo.example.com`\""
    }
  ]
};

Template.api.settings = {
  id: "meteor_settings",
  name: "Meteor.settings",
  locus: "Anywhere",
  descr: ["`Meteor.settings` contains any deployment-specific options that were " +
          "provided using the `--settings` option for `meteor run` or `meteor deploy`. " +
          "If you provide the `--settings` option, `Meteor.settings` will be the " +
          "JSON object in the file you specify.  Otherwise, `Meteor.settings` will " +
          "be an empty object. If the object contains a key named `public`, then " +
          "`Meteor.settings.public` will also be available on the client."]
};

Template.api.release = {
  id: "meteor_release",
  name: "Meteor.release",
  locus: "Anywhere",
  descr: ["`Meteor.release` is a string containing the name of the " +
          "[release](#meteorupdate) with which the project was built (for " +
          "example, `\"" +
          Meteor.release +
          "\"`). It is `undefined` if the project was built using a git " +
          "checkout of Meteor."]
};

Template.api.ejsonParse = {
  id: "ejson_parse",
  name: "EJSON.parse(str)",
  locus: "Anywhere",
  args: [ {name: "str", type: "String", descr: "A string to parse into an EJSON value."} ],
  descr: ["Parse a string into an EJSON value. Throws an error if the string is not valid EJSON."]
},

Template.api.ejsonStringify = {
  id: "ejson_stringify",
  name: "EJSON.stringify(val, [options])",
  locus: "Anywhere",
  args: [ {name: "val", type: "EJSON-compatible value", descr: "A value to stringify."} ],
  options: [
    {name: "indent",
     type: "Boolean, Integer, or String",
     descr: "Indents objects and arrays for easy readability.  When `true`, indents by 2 spaces; when an integer, indents by that number of spaces; and when a string, uses the string as the indentation pattern."},
    {name: "canonical",
     type: "Boolean",
     descr: "When `true`, stringifies keys in an object in sorted order."}
  ],
  descr: ["Serialize a value to a string.\n\nFor EJSON values, the serialization " +
          "fully represents the value. For non-EJSON values, serializes the " +
          "same way as `JSON.stringify`."]
},


Template.api.ejsonFromJSONValue = {
  id: "ejson_from_json_value",
  name: "EJSON.fromJSONValue(val)",
  locus: "Anywhere",
  args: [ {name: "val", type: "JSON-compatible value", descr: "A value to deserialize into EJSON."} ],
  descr: ["Deserialize an EJSON value from its  plain JSON representation."]
},

Template.api.ejsonToJSONValue = {
  id: "ejson_to_json_value",
  name: "EJSON.toJSONValue(val)",
  locus: "Anywhere",
  args: [ {name: "val", type: "EJSON-compatible value", descr: "A value to serialize to plain JSON."} ],
  descr: ["Serialize an EJSON-compatible value into its plain JSON representation."]
},

Template.api.ejsonEquals = {
  id: "ejson_equals",
  name: "EJSON.equals(a, b, [options])",
  locus: "Anywhere",
  args: [ {name: "a", type: "EJSON-compatible object"},
          {name: "b", type: "EJSON-compatible object"} ],
  options: [
    {name: "keyOrderSensitive",
     type: "Boolean",
     descr: "Compare in key sensitive order, if supported by the JavaScript implementation.  For example, `{a: 1, b: 2}` is equal to `{b: 2, a: 1}` only when `keyOrderSensitive` is `false`.  The default is `false`."}
  ],
  descr: ["Return true if `a` and `b` are equal to each other.  Return false otherwise." +
          "  Uses the `equals` method on `a` if present, otherwise performs a deep comparison."]
},

Template.api.ejsonClone = {
  id: "ejson_clone",
  name: "EJSON.clone(val)",
  locus: "Anywhere",
  args: [ {name: "val", type: "EJSON-compatible value", descr: "A value to copy."} ],
  descr: ["Return a deep copy of `val`."]
},

Template.api.ejsonNewBinary = {
  id: "ejson_new_binary",
  name: "EJSON.newBinary(size)",
  locus: "Anywhere",
  args: [ {name: "size", type: "Number", descr: "The number of bytes of binary data to allocate."} ],
  descr: ["Allocate a new buffer of binary data that EJSON can serialize."]
},

Template.api.ejsonIsBinary = {
  id: "ejson_is_binary",
  name: "EJSON.isBinary(x)",
  locus: "Anywhere",
  descr: ["Returns true if `x` is a buffer of binary data, as returned from [`EJSON.newBinary`](#ejson_new_binary)."]
},

Template.api.ejsonAddType = {
  id: "ejson_add_type",
  name: "EJSON.addType(name, factory)",
  locus: "Anywhere",
  args: [
    {name: "name",
     type: "String",
     descr: "A tag for your custom type; must be unique among custom data types defined in your project, and must match the result of your type's `typeName` method."
    },
    {name: "factory",
     type: "Function",
     descr: "A function that deserializes a JSON-compatible value into an instance of your type.  This should match the serialization performed by your type's `toJSONValue` method."
    }
  ],
  descr: ["Add a custom datatype to EJSON."]
};

Template.api.ejsonTypeClone = {
  id: "ejson_type_clone",
  name: "<i>instance</i>.clone()",
  descr: ["Return a value `r` such that `this.equals(r)` is true, and modifications to `r` do not affect `this` and vice versa."]
};

Template.api.ejsonTypeEquals = {
  id: "ejson_type_equals",
  name: "<i>instance</i>.equals(other)",
  args: [ {name: "other", type: "object", descr: "Another object to compare this to."}],
  descr: ["Return `true` if `other` has a value equal to `this`; `false` otherwise."]
};

Template.api.ejsonTypeName = {
  id: "ejson_type_typeName",
  name: "<i>instance</i>.typeName()",
  descr: ["Return the tag used to identify this type.  This must match the tag used to register this type with [`EJSON.addType`](#ejson_add_type)."]
};

Template.api.ejsonTypeToJSONValue = {
  id: "ejson_type_toJSONValue",
  name: "<i>instance</i>.toJSONValue()",
  descr: ["Serialize this instance into a JSON-compatible value."]
};

Template.api.publish = {
  id: "meteor_publish",
  name: "Meteor.publish(name, func)",
  locus: "Server",
  descr: ["Publish a record set."],
  args: [
    {name: "name",
     type: "String",
     descr: "Name of the attribute set.  If `null`, the set has no name, and the record set is automatically sent to all connected clients."},
    {name: "func",
     type: "Function",
     descr: "Function called on the server each time a client subscribes.  Inside the function, `this` is the publish handler object, described below.  If the client passed arguments to `subscribe`, the function is called with the same arguments."}
  ]
};

Template.api.subscription_added = {
  id: "publish_added",
  name: "<i>this</i>.added(collection, id, fields)",
  locus: "Server",
  descr: ["Call inside the publish function.  Informs the subscriber that a document has been added to the record set."],
  args: [
    {name: "collection",
     type: "String",
     descr: "The name of the collection that contains the new document."
    },
    {name: "id",
     type: "String",
     descr: "The new document's ID."
    },
    {name: "fields",
     type: "Object",
     descr: "The fields in the new document.  If `_id` is present it is ignored."
    }
  ]
};

Template.api.subscription_changed = {
  id: "publish_changed",
  name: "<i>this</i>.changed(collection, id, fields)",
  locus: "Server",
  descr: ["Call inside the publish function.  Informs the subscriber that a document in the record set has been modified."],
  args: [
    {name: "collection",
     type: "String",
     descr: "The name of the collection that contains the changed document."
    },
    {name: "id",
     type: "String",
     descr: "The changed document's ID."
    },
    {name: "fields",
     type: "Object",
     descr: "The fields in the document that have changed, together with their new values.  If a field is not present in `fields` it was left unchanged; if it is present in `fields` and has a value of `undefined` it was removed from the document.  If `_id` is present it is ignored."
    }
  ]
};

Template.api.subscription_removed = {
  id: "publish_removed",
  name: "<i>this</i>.removed(collection, id)",
  locus: "Server",
  descr: ["Call inside the publish function.  Informs the subscriber that a document has been removed from the record set."],
  args: [
    {name: "collection",
     type: "String",
     descr: "The name of the collection that the document has been removed from."
    },
    {name: "id",
     type: "String",
     descr: "The ID of the document that has been removed."
    }
  ]
};

Template.api.subscription_ready = {
  id: "publish_ready",
  name: "<i>this</i>.ready()",
  locus: "Server",
  descr: ["Call inside the publish function.  Informs the subscriber that an initial, complete snapshot of the record set has been sent.  This will trigger a call on the client to the `onReady` callback passed to  [`Meteor.subscribe`](#meteor_subscribe), if any."]
};


Template.api.subscription_error = {
  id: "publish_error",
  name: "<i>this</i>.error(error)",
  locus: "Server",
  descr: ["Call inside the publish function.  Stops this client's subscription, triggering a call on the client to the `onError` callback passed to [`Meteor.subscribe`](#meteor_subscribe), if any. If `error` is not a [`Meteor.Error`](#meteor_error), it will be [sanitized](#meteor_error)."]
};

Template.api.subscription_stop = {
  id: "publish_stop",
  name: "<i>this</i>.stop()",
  locus: "Server",
  descr: ["Call inside the publish function.  Stops this client's subscription; the `onError` callback is *not* invoked on the client."]
};

Template.api.subscription_onStop = {
  id: "publish_onstop",
  name: "<i>this</i>.onStop(func)",
  locus: "Server",
  descr: ["Call inside the publish function.  Registers a callback function to run when the subscription is stopped."],
  args: [
    {name: "func",
     type: "Function",
     descr: "The callback function"
    }
  ]
};

Template.api.subscription_userId = {
  id: "publish_userId",
  name: "<i>this</i>.userId",
  locus: "Server",
  descr: ["Access inside the publish function. The id of the logged-in user, or `null` if no user is logged in."]
};


Template.api.subscribe = {
  id: "meteor_subscribe",
  name: "Meteor.subscribe(name [, arg1, arg2, ... ] [, callbacks])",
  locus: "Client",
  descr: ["Subscribe to a record set.  Returns a handle that provides `stop()` and `ready()` methods."],
  args: [
    {name: "name",
     type: "String",
     descr: "Name of the subscription.  Matches name of server's publish() call."},
    {name: "arg1, arg2, ...",
     type: "Any",
     descr: "Optional arguments passed to publisher function on server."},
    {name: "callbacks",
     type: "Function or Object",
     descr: "Optional. May include `onError` and `onReady` callbacks. If a function is passed instead of an object, it is interpreted as an `onReady` callback."}
  ]
};

Template.api.methods = {
  id: "meteor_methods",
  name: "Meteor.methods(methods)",
  locus: "Anywhere",
  descr: ["Defines functions that can be invoked over the network by clients."],
  args: [
    {name: "methods",
     type: "Object",
     descr: "Dictionary whose keys are method names and values are functions."}
  ]
};

Template.api.method_invocation_userId = {
  id: "method_userId",
  name: "<i>this</i>.userId",
  locus: "Anywhere",
  descr: ["The id of the user that made this method call, or `null` if no user was logged in."]
};

Template.api.method_invocation_setUserId = {
  id: "method_setUserId",
  name: "<i>this</i>.setUserId(userId)",
  locus: "Server",
  descr: ["Set the logged in user."],
  args: [
    {name: "userId",
     type: "String or null",
     descr: "The value that should be returned by `userId` on this connection."}
  ]
};

Template.api.method_invocation_unblock = {
  id: "method_unblock",
  name: "<i>this</i>.unblock()",
  locus: "Server",
  descr: ["Call inside a method invocation.  Allow subsequent method from this client to begin running in a new fiber."]
};

Template.api.method_invocation_isSimulation = {
  id: "method_issimulation",
  name: "<i>this</i>.isSimulation",
  locus: "Anywhere",
  descr: ["Access inside a method invocation.  Boolean value, true if this invocation is a stub."]
};

Template.api.error = {
  id: "meteor_error",
  name: "new Meteor.Error(error, reason, details)",
  locus: "Anywhere",
  descr: ["This class represents a symbolic error thrown by a method."],
  args: [
    {name: "error",
     type: "Number",
     descr: "A numeric error code, likely similar to an HTTP code (eg, 404, 500)."},
    {name: "reason",
     type: "String",
     descr: "Optional.  A short human-readable summary of the error, like 'Not Found'."},
    {name: "details",
     type: "String",
     descr: "Optional.  Additional information about the error, like a textual stack trace."}
  ]
};

Template.api.meteor_call = {
  id: "meteor_call",
  name: "Meteor.call(name, param1, param2, ... [, asyncCallback])",
  locus: "Anywhere",
  descr: ["Invokes a method passing any number of arguments."],
  args: [
    {name: "name",
     type: "String",
     descr: "Name of method to invoke"},
    {name: "param1, param2, ...",
     type: "EJSON",
     descr: "Optional method arguments"},
    {name: "asyncCallback",
     type: "Function",
     descr: "Optional callback, which is called asynchronously with the error or result after the method is complete. If not provided, the method runs synchronously if possible (see below)."}
  ]
};

Template.api.meteor_apply = {
  id: "meteor_apply",
  name: "Meteor.apply(name, params [, options] [, asyncCallback])",
  locus: "Anywhere",
  descr: ["Invoke a method passing an array of arguments."],
  args: [
    {name: "name",
     type: "String",
     descr: "Name of method to invoke"},
    {name: "params",
     type: "Array",
     descr: "Method arguments"},
    {name: "asyncCallback",
     type: "Function",
     descr: "Optional callback; same semantics as in [`Meteor.call`](#meteor_call)."}
  ],
  options: [
    {name: "wait",
     type: "Boolean",
     descr: "(Client only) If true, don't send this method until all previous method calls have completed, and don't send any subsequent method calls until this one is completed."},
    {name: "onResultReceived",
     type: "Function",
     descr: "(Client only) This callback is invoked with the error or result of the method (just like `asyncCallback`) as soon as the error or result is available. The local cache may not yet reflect the writes performed by the method."}
  ]
};

Template.api.status = {
  id: "meteor_status",
  name: "Meteor.status()",
  locus: "Client",
  descr: ["Get the current connection status. A reactive data source."]
};

Template.api.reconnect = {
  id: "meteor_reconnect",
  name: "Meteor.reconnect()",
  locus: "Client",
  descr: [
    "Force an immediate reconnection attempt if the client is not connected to the server.",
    "This method does nothing if the client is already connected."]
};

Template.api.disconnect = {
  id: "meteor_disconnect",
  name: "Meteor.disconnect()",
  locus: "Client",
  descr: [
    "Disconnect the client from the server."]
};

Template.api.connect = {
  id: "ddp_connect",
  name: "DDP.connect(url)",
  locus: "Anywhere",
  descr: ["Connect to the server of a different Meteor application to subscribe to its document sets and invoke its remote methods."],
  args: [
    {name: "url",
     type: "String",
     descr: "The URL of another Meteor application."}
  ]
};

// onAutopublish

Template.api.meteor_collection = {
  id: "meteor_collection",
  name: "new Meteor.Collection(name, [options])",
  locus: "Anywhere",
  descr: ["Constructor for a Collection"],
  args: [
    {name: "name",
     type: "String",
     descr: "The name of the collection.  If null, creates an unmanaged (unsynchronized) local collection."}
  ],
  options: [
    {name: "connection",
     type: "Object",
     descr: "The server connection that will manage this collection. Uses the default connection if not specified.  Pass the return value of calling [`DDP.connect`](#ddp_connect) to specify a different server. Pass `null` to specify no connection. Unmanaged (`name` is null) collections cannot specify a connection."
    },
    {name: "idGeneration",
     type: "String",
     descr: "The method of generating the `_id` fields of new documents in this collection.  Possible values:\n\n" +
     " - **`'STRING'`**: random strings\n" +
     " - **`'MONGO'`**:  random [`Meteor.Collection.ObjectID`](#collection_object_id) values\n\n" +
     "The default id generation technique is `'STRING'`."
    },
    {name: "transform",
     type: "Function",
     descr: "An optional transformation function. Documents will be passed through this function before being returned from `fetch` or `findOne`, and before being passed to callbacks of `observe`, `allow`, and `deny`."
    }
  ]
};

Template.api.find = {
  id: "find",
  name: "<em>collection</em>.find(selector, [options])",
  locus: "Anywhere",
  descr: ["Find the documents in a collection that match the selector."],
  args: [
    {name: "selector",
     type: "Mongo selector, or String",
     type_link: "selectors",
     descr: "The query"}
  ],
  options: [
    {name: "sort",
     type: "Sort specifier",
     type_link: "sortspecifiers",
     descr: "Sort order (default: natural order)"},
    {name: "skip",
     type: "Number",
     descr: "Number of results to skip at the beginning"},
    {name: "limit",
     type: "Number",
     descr: "Maximum number of results to return"},
    {name: "fields",
     type: "Field specifier",
     type_link: "fieldspecifiers",
     descr: "Dictionary of fields to return or exclude."},
    {name: "reactive",
     type: "Boolean",
     descr: "(Client only) Default `true`; pass `false` to disable reactivity"},
    {name: "transform",
     type: "Function",
     descr: "Overrides `transform` on the  [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation."}
  ]
};

Template.api.findone = {
  id: "findone",
  name: "<em>collection</em>.findOne(selector, [options])",
  locus: "Anywhere",
  descr: ["Finds the first document that matches the selector, as ordered by sort and skip options."],
  args: [
    {name: "selector",
     type: "Mongo selector, or String",
     type_link: "selectors",
     descr: "The query"}
  ],
  options: [
    {name: "sort",
     type: "Sort specifier",
     type_link: "sortspecifiers",
     descr: "Sort order (default: natural order)"},
    {name: "skip",
     type: "Number",
     descr: "Number of results to skip at the beginning"},
    {name: "fields",
     type: "Field specifier",
     type_link: "fieldspecifiers",
     descr: "Dictionary of fields to return or exclude."},
    {name: "reactive",
     type: "Boolean",
     descr: "(Client only) Default true; pass false to disable reactivity"},
    {name: "transform",
     type: "Function",
     descr:  "Overrides `transform` on the [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation."
    }
  ]
};

Template.api.insert = {
  id: "insert",
  name: "<em>collection</em>.insert(doc, [callback])",
  locus: "Anywhere",
  descr: ["Insert a document in the collection.  Returns its unique _id."],
  args: [
    {name: "doc",
     type: "Object",
     descr: "The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you."},
    {name: "callback",
     type: "Function",
     descr: "Optional.  If present, called with an error object as the first argument and, if no error, the _id as the second."}
  ]
};

Template.api.update = {
  id: "update",
  name: "<em>collection</em>.update(selector, modifier, [options], [callback])",
  locus: "Anywhere",
  descr: ["Modify one or more documents in the collection. Returns the number of affected documents."],
  args: [
    {name: "selector",
     type: "Mongo selector, or object id",
     type_link: "selectors",
     descr: "Specifies which documents to modify"},
    {name: "modifier",
     type: "Mongo modifier",
     type_link: "modifiers",
     descr: "Specifies how to modify the documents"},
    {name: "callback",
     type: "Function",
     descr: "Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second."}
  ],
  options: [
    {name: "multi",
     type: "Boolean",
     descr: "True to modify all matching documents; false to only modify one of the matching documents (the default)."},
    {name: "upsert",
     type: "Boolean",
     descr: "True to insert a document if no matching documents are found."}
  ]
};

Template.api.upsert = {
  id: "upsert",
  name: "<em>collection</em>.upsert(selector, modifier, [options], [callback])",
  locus: "Anywhere",
  descr: ["Modify one or more documents in the collection, or insert one if no matching documents were found. " +
          "Returns an object with keys `numberAffected` (the number of documents modified) " +
          " and `insertedId` (the unique _id of the document that was inserted, if any)."],
  args: [
    {name: "selector",
     type: "Mongo selector, or object id",
     type_link: "selectors",
     descr: "Specifies which documents to modify"},
    {name: "modifier",
     type: "Mongo modifier",
     type_link: "modifiers",
     descr: "Specifies how to modify the documents"},
    {name: "callback",
     type: "Function",
     descr: "Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second."}
  ],
  options: [
    {name: "multi",
     type: "Boolean",
     descr: "True to modify all matching documents; false to only modify one of the matching documents (the default)."}
  ]
};


Template.api.remove = {
  id: "remove",
  name: "<em>collection</em>.remove(selector, [callback])",
  locus: "Anywhere",
  descr: ["Remove documents from the collection"],
  args: [
    {name: "selector",
     type: "Mongo selector, or object id",
     type_link: "selectors",
     descr: "Specifies which documents to remove"},
    {name: "callback",
     type: "Function",
     descr: "Optional.  If present, called with an error object as its argument."}
  ]
};

Template.api.allow = {
  id: "allow",
  name: "<em>collection</em>.allow(options)",
  locus: "Server",
  descr: ["Allow users to write directly to this collection from client code, subject to limitations you define."],
  options: [
    {name: "insert, update, remove",
     type: "Function",
     descr: "Functions that look at a proposed modification to the database and return true if it should be allowed."},
    {name: "fetch",
     type: "Array of String",
     descr: "Optional performance enhancement. Limits the fields that will be fetched from the database for inspection by your `update` and `remove` functions."},
    {name: "transform",
     type: "Function",
     descr: "Overrides `transform` on the  [`Collection`](#collections).  Pass `null` to disable transformation."}
  ]
};

Template.api.deny = {
  id: "deny",
  name: "<em>collection</em>.deny(options)",
  locus: "Server",
  descr: ["Override `allow` rules."],
  options: [
    {name: "insert, update, remove",
     type: "Function",
     descr: "Functions that look at a proposed modification to the database and return true if it should be denied, even if an `allow` rule says otherwise."},
    {name: "fetch",
     type: "Array of Strings",
     descr: "Optional performance enhancement. Limits the fields that will be fetched from the database for inspection by your `update` and `remove` functions."},
    {name: "transform",
     type: "Function",
     descr:  "Overrides `transform` on the  [`Collection`](#collections).  Pass `null` to disable transformation."}
  ]
};


Template.api.cursor_count = {
  id: "count",
  name: "<em>cursor</em>.count()",
  locus: "Anywhere",
  descr: ["Returns the number of documents that match a query."]
};

Template.api.cursor_fetch = {
  id: "fetch",
  name: "<em>cursor</em>.fetch()",
  locus: "Anywhere",
  descr: ["Return all matching documents as an Array."]
};

Template.api.cursor_foreach = {
  id: "foreach",
  name: "<em>cursor</em>.forEach(callback, [thisArg])",
  locus: "Anywhere",
  descr: ["Call `callback` once for each matching document, sequentially and synchronously."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself."},
    {name: "thisArg",
     type: "Any",
     descr: "An object which will be the value of `this` inside `callback`."}
  ]
};

Template.api.cursor_map = {
  id: "map",
  name: "<em>cursor</em>.map(callback, [thisArg])",
  locus: "Anywhere",
  descr: ["Map callback over all matching documents.  Returns an Array."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself."},
    {name: "thisArg",
     type: "Any",
     descr: "An object which will be the value of `this` inside `callback`."}
  ]
};

Template.api.cursor_rewind = {
  id: "rewind",
  name: "<em>cursor</em>.rewind()",
  locus: "Anywhere",
  descr: ["Resets the query cursor."],
  args: [ ]
};

Template.api.cursor_observe = {
  id: "observe",
  name: "<em>cursor</em>.observe(callbacks)",
  locus: "Anywhere",
  descr: ["Watch a query.  Receive callbacks as the result set changes."],
  args: [
    {name: "callbacks",
     type: "Object",
     descr: "Functions to call to deliver the result set as it changes"}
  ]
};

Template.api.cursor_observe_changes = {
  id: "observe_changes",
  name: "<em>cursor</em>.observeChanges(callbacks)",
  locus: "Anywhere",
  descr: ["Watch a query.  Receive callbacks as the result set changes.  Only the differences between the old and new documents are passed to the callbacks."],
  args: [
    {name: "callbacks",
     type: "Object",
     descr: "Functions to call to deliver the result set as it changes"}
  ]
};

Template.api.id = {
  id: "meteor_id",
  name: "Random.id()",
  locus: "Anywhere",
  descr: ["Return a unique identifier."],
  args: [ ]
};

Template.api.collection_object_id = {
  id: "collection_object_id",
  name: "new Meteor.Collection.ObjectID(hexString)",
  locus: "Anywhere",
  descr: ["Create a Mongo-style `ObjectID`.  If you don't specify a `hexString`, the `ObjectID` will generated randomly (not using MongoDB's ID construction rules)."],
  args: [ {
    name: "hexString",
    type: "String",
    descr: ["Optional.  The 24-character hexadecimal contents of the ObjectID to create"]
  }]
};

Template.api.selectors = {
  id: "selectors",
  name: "Mongo-style Selectors"
};

Template.api.modifiers = {
  id: "modifiers",
  name: "Mongo-style Modifiers"
};

Template.api.sortspecifiers = {
  id: "sortspecifiers",
  name: "Sort Specifiers"
};

Template.api.fieldspecifiers = {
  id: "fieldspecifiers",
  name: "Field Specifiers"
};

////// DEPS

Template.api.deps_autorun = {
  id: "deps_autorun",
  name: "Deps.autorun(runFunc)",
  locus: "Client",
  descr: ["Run a function now and rerun it later whenever its dependencies change. Returns a Computation object that can be used to stop or observe the rerunning."],
  args: [
    {name: "runFunc",
     type: "Function",
     descr: "The function to run. It receives one argument: the Computation object that will be returned."}
  ]
};

Template.api.deps_flush = {
  id: "deps_flush",
  name: "Deps.flush()",
  locus: "Client",
  descr: ["Process all reactive updates immediately and ensure that all invalidated computations are rerun."]
};

Template.api.deps_nonreactive = {
  id: "deps_nonreactive",
  name: "Deps.nonreactive(func)",
  locus: "Client",
  descr: ["Run a function without tracking dependencies."],
  args: [
    {name: "func",
     type: "Function",
     descr: "A function to call immediately."}
  ]
};

Template.api.deps_active = {
  id: "deps_active",
  name: "Deps.active",
  locus: "Client",
  descr: ["True if there is a current computation, meaning that dependencies on reactive data sources will be tracked and potentially cause the current computation to be rerun."]
};

Template.api.deps_currentcomputation = {
  id: "deps_currentcomputation",
  name: "Deps.currentComputation",
  locus: "Client",
  descr: ["The current computation, or `null` if there isn't one.  The current computation is the [`Deps.Computation`](#deps_computation) object created by the innermost active call to `Deps.autorun`, and it's the computation that gains dependencies when reactive data sources are accessed."]
};

Template.api.deps_oninvalidate = {
  id: "deps_oninvalidate",
  name: "Deps.onInvalidate(callback)",
  locus: "Client",
  descr: ["Registers a new [`onInvalidate`](#computation_oninvalidate) callback on the current computation (which must exist), to be called immediately when the current computation is invalidated or stopped."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "A callback function that will be invoked as `func(c)`, where `c` is the computation on which the callback is registered."}
  ]
};

Template.api.deps_afterflush = {
  id: "deps_afterflush",
  name: "Deps.afterFlush(callback)",
  locus: "Client",
  descr: ["Schedules a function to be called during the next flush, or later in the current flush if one is in progress, after all invalidated computations have been rerun.  The function will be run once and not on subsequent flushes unless `afterFlush` is called again."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "A function to call at flush time."}
  ]
};

Template.api.computation_stop = {
  id: "computation_stop",
  name: "<em>computation</em>.stop()",
  locus: "Client",
  descr: ["Prevents this computation from rerunning."]
};

Template.api.computation_invalidate = {
  id: "computation_invalidate",
  name: "<em>computation</em>.invalidate()",
  locus: "Client",
  descr: ["Invalidates this computation so that it will be rerun."]
};

Template.api.computation_oninvalidate = {
  id: "computation_oninvalidate",
  name: "<em>computation</em>.onInvalidate(callback)",
  locus: "Client",
  descr: ["Registers `callback` to run when this computation is next invalidated, or runs it immediately if the computation is already invalidated.  The callback is run exactly once and not upon future invalidations unless `onInvalidate` is called again after the computation becomes valid again."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "Function to be called on invalidation. Receives one argument, the computation that was invalidated."}
  ]
};

Template.api.computation_stopped = {
  id: "computation_stopped",
  name: "<em>computation</em>.stopped",
  locus: "Client",
  descr: ["True if this computation has been stopped."]
};

Template.api.computation_invalidated = {
  id: "computation_invalidated",
  name: "<em>computation</em>.invalidated",
  locus: "Client",
  descr: ["True if this computation has been invalidated (and not yet rerun), or if it has been stopped."]
};

Template.api.computation_firstrun = {
  id: "computation_firstrun",
  name: "<em>computation</em>.firstRun",
  locus: "Client",
  descr: ["True during the initial run of the computation at the time `Deps.autorun` is called, and false on subsequent reruns and at other times."]
};

Template.api.dependency_changed = {
  id: "dependency_changed",
  name: "<em>dependency</em>.changed()",
  locus: "Client",
  descr: ["Invalidate all dependent computations immediately and remove them as dependents."]
};

Template.api.dependency_depend = {
  id: "dependency_depend",
  name: "<em>dependency</em>.depend([fromComputation])",
  locus: "Client",
  descr: ["Declares that the current computation (or `fromComputation` if given) depends on `dependency`.  The computation will be invalidated the next time `dependency` changes.", "If there is no current computation and `depend()` is called with no arguments, it does nothing and returns false.", "Returns true if the computation is a new dependent of `dependency` rather than an existing one."],
  args: [
    {name: "fromComputation",
     type: "Deps.Computation",
     descr: "An optional computation declared to depend on `dependency` instead of the current computation."}
  ]
};

Template.api.dependency_hasdependents = {
  id: "dependency_hasdependents",
  name: "<em>dependency</em>.hasDependents()",
  locus: "Client",
  descr: ["True if this Dependency has one or more dependent Computations, which would be invalidated if this Dependency were to change."]
};

//////

// writeFence
// invalidationCrossbar

Template.api.render = {
  id: "meteor_render",
  name: "Meteor.render(htmlFunc)",
  locus: "Client",
  descr: ["Create DOM nodes that automatically update themselves as data changes."],
  args: [
    {name: "htmlFunc",
     type: "Function returning a string of HTML",
     descr: "Function that generates HTML to be rendered.  Called immediately and re-run whenever data changes.  May also be a string of HTML instead of a function."}
  ]
};

Template.api.renderList = {
  id: "meteor_renderlist",
  name: "Meteor.renderList(observable, docFunc, [elseFunc])",
  locus: "Client",
  descr: ["Create DOM nodes that automatically update themselves based on the results of a database query."],
  args: [
    {name: "observable",
     type: "Cursor",
     type_link: "meteor_collection_cursor",
     descr: "Query cursor to observe as a reactive source of ordered documents."},
    {name: "docFunc",
     type: "Function taking a document and returning HTML",
     descr: "Render function to be called for each document."},
    {name: "elseFunc",
     type: "Function returning HTML",
     descr: "Optional.  Render function to be called when query is empty."}
  ]
};


Template.api.eventmaps = {
  id: "eventmaps",
  name: "Event Maps"
};

Template.api.constant = {
  id: "constant",
  name: "Constant regions"
};

Template.api.isolate = {
  id: "isolate",
  name: "Reactivity isolation"
};



Template.api.user = {
  id: "meteor_user",
  name: "Meteor.user()",
  locus: "Anywhere but publish functions",
  descr: ["Get the current user record, or `null` if no user is logged in. A reactive data source."]
};

Template.api.currentUser = {
  id: "template_currentuser",
  name: "{{currentUser}}",
  locus: "Handlebars templates",
  descr: ["Calls [Meteor.user()](#meteor_user). Use `{{#if currentUser}}` to check whether the user is logged in."]
};

Template.api.userId = {
  id: "meteor_userid",
  name: "Meteor.userId()",
  locus: "Anywhere but publish functions",
  descr: ["Get the current user id, or `null` if no user is logged in. A reactive data source."]
};


Template.api.users = {
  id: "meteor_users",
  name: "Meteor.users",
  locus: "Anywhere",
  descr: ["A [Meteor.Collection](#collections) containing user documents."]
};

Template.api.loggingIn = {
  id: "meteor_loggingin",
  name: "Meteor.loggingIn()",
  locus: "Client",
  descr: ["True if a login method (such as `Meteor.loginWithPassword`, `Meteor.loginWithFacebook`, or `Accounts.createUser`) is currently in progress. A reactive data source."]
};

Template.api.loggingInTemplate = {
  id: "template_loggingin",
  name: "{{loggingIn}}",
  locus: "Handlebars templates",
  descr: ["Calls [Meteor.loggingIn()](#meteor_loggingin)."]
};



Template.api.logout = {
  id: "meteor_logout",
  name: "Meteor.logout([callback])",
  locus: "Client",
  descr: ["Log the user out."],
  args: [
    {
      name: "callback",
      type: "Function",
      descr: "Optional callback. Called with no arguments on success, or with a single `Error` argument on failure."
    }
  ]
};

Template.api.logoutOtherClients = {
  id: "meteor_logoutotherclients",
  name: "Meteor.logoutOtherClients([callback])",
  locus: "Client",
  descr: ["Log out other clients logged in as the current user, but does not log out the client that calls this function."],
  args: [
    {
      name: "callback",
      type: "Function",
      descr: "Optional callback. Called with no arguments on success, or with a single `Error` argument on failure."
    }
  ]
};


Template.api.loginWithPassword = {
  id: "meteor_loginwithpassword",
  name: "Meteor.loginWithPassword(user, password, [callback])",
  locus: "Client",
  descr: ["Log the user in with a password."],
  args: [
    {
      name: "user",
      type: "Object or String",
      descr: "Either a string interpreted as a username or an email; or an object with a single key: `email`, `username` or `id`."
    },
    {
      name: "password",
      type: "String",
      descr: "The user's password. This is __not__ sent in plain text over the wire &mdash; it is secured with [SRP](http://en.wikipedia.org/wiki/Secure_Remote_Password_protocol)."
    },
    {
      name: "callback",
      type: "Function",
      descr: "Optional callback. Called with no arguments on success, or with a single `Error` argument on failure."
    }
  ]
};


Template.api.loginWithExternalService = {
  id: "meteor_loginwithexternalservice",
  name: "Meteor.loginWith<i>ExternalService</i>([options], [callback])",
  locus: "Client",
  descr: ["Log the user in using an external service."],
  args: [
    {
      name: "callback",
      type: "Function",
      descr: "Optional callback. Called with no arguments on success, or with a single `Error` argument on failure."
    }
  ],
  options: [
    {
      name: "requestPermissions",
      type: "Array of Strings",
      descr: "A list of permissions to request from the user."
    },
    {
      name: "requestOfflineToken",
      type: "Boolean",
      descr: "If true, asks the user for permission to act on their behalf when offline. This stores an additional offline token in the `services` field of the user document. Currently only supported with Google."
    },
    {
      name: "forceApprovalPrompt",
      type: "Boolean",
      descr: "If true, forces the user to approve the app's permissions, even if previously approved. Currently only supported with Google."
    }
  ]
};



Template.api.accounts_config = {
  id: "accounts_config",
  name: "Accounts.config(options)",
  locus: "Anywhere",
  descr: ["Set global accounts options."],
  options: [
    {
      name: "sendVerificationEmail",
      type: "Boolean",
      descr: "New users with an email address will receive an address verification email."
    },
    {
      name: "forbidClientAccountCreation",
      type: "Boolean",
      descr: "Calls to [`createUser`](#accounts_createuser) from the client will be rejected. In addition, if you are using [accounts-ui](#accountsui), the \"Create account\" link will not be available."
    },
    {
      name: "restrictCreationByEmailDomain",
      type: "String Or Function",
      descr: "If set, only allow new users with an email in the specified domain or if the predicate function returns true. Works with password-based sign-in and external services that expose email addresses (Google, Facebook, GitHub). All existing users still can log in after enabling this option. Example: `Accounts.config({ restrictCreationByEmailDomain: 'school.edu' })`."
    },
    {
      name: "loginExpirationInDays",
      type: "Number",
      descr: "The number of days from when a user logs in until their token expires and they are logged out. Defaults to 90. Set to `null` to disable login expiration."
    }
  ]
};

Template.api.accounts_ui_config = {
  id: "accounts_ui_config",
  name: "Accounts.ui.config(options)",
  locus: "Client",
  descr: ["Configure the behavior of [`{{loginButtons}}`](#accountsui)."],
  options: [
    {
      name: "requestPermissions",
      type: "Object",
      descr: "Which [permissions](#requestpermissions) to request from the user for each external service."
    },
    {
      name: "requestOfflineToken",
      type: "Object",
      descr: "To ask the user for permission to act on their behalf when offline, map the relevant external service to `true`. Currently only supported with Google. See [Meteor.loginWithExternalService](#meteor_loginwithexternalservice) for more details."
    },
    {
      name: "passwordSignupFields",
      type: "String",
      descr: "Which fields to display in the user creation form. One of '`USERNAME_AND_EMAIL`', '`USERNAME_AND_OPTIONAL_EMAIL`', '`USERNAME_ONLY`', or '`EMAIL_ONLY`' (default)."
    }
  ]
};

Template.api.accounts_validateNewUser = {
  id: "accounts_validatenewuser",
  name: "Accounts.validateNewUser(func)",
  locus: "Server",
  descr: ["Set restrictions on new user creation."],
  args: [
    {
      name: "func",
      type: "Function",
      descr: "Called whenever a new user is created. Takes the new user object, and returns true to allow the creation or false to abort."
    }
  ]
};

Template.api.accounts_onCreateUser = {
  id: "accounts_oncreateuser",
  name: "Accounts.onCreateUser(func)",
  locus: "Server",
  descr: ["Customize new user creation."],
  args: [
    {
      name: "func",
      type: "Function",
      descr: "Called whenever a new user is created. Return the new user object, or throw an `Error` to abort the creation."
    }
  ]
};



Template.api.accounts_createUser = {
  id: "accounts_createuser",
  name: "Accounts.createUser(options, [callback])",
  locus: "Anywhere",
  descr: ["Create a new user."],
  args: [
    {
      name: "callback",
      type: "Function",
      descr: "Client only, optional callback. Called with no arguments on success, or with a single `Error` argument on failure."
    }
  ],
  options: [
    {
      name: "username",
      type: "String",
      descr: "A unique name for this user."
    },
    {
      name: "email",
      type: "String",
      descr: "The user's email address."
    },
    {
      name: "password",
      type: "String",
      descr: "The user's password. This is __not__ sent in plain text over the wire."
    },
    {
      name: "profile",
      type: "Object",
      descr: "The user's profile, typically including the `name` field."
    }
  ]
};

Template.api.accounts_changePassword = {
  id: "accounts_changepassword",
  name: "Accounts.changePassword(oldPassword, newPassword, [callback])",
  locus: "Client",
  descr: ["Change the current user's password. Must be logged in."],
  args: [
    {
      name: "oldPassword",
      type: "String",
      descr: "The user's current password. This is __not__ sent in plain text over the wire."
    },
    {
      name: "newPassword",
      type: "String",
      descr: "A new password for the user. This is __not__ sent in plain text over the wire."
    },
    {
      name: "callback",
      type: "Function",
      descr: "Optional callback. Called with no arguments on success, or with a single `Error` argument on failure."
    }
  ]
};

Template.api.accounts_forgotPassword = {
  id: "accounts_forgotpassword",
  name: "Accounts.forgotPassword(options, [callback])",
  locus: "Client",
  descr: ["Request a forgot password email."],
  args: [
    {
      name: "callback",
      type: "Function",
      descr: "Optional callback. Called with no arguments on success, or with a single `Error` argument on failure."
    }
  ],
  options: [
    {
      name: "email",
      type: "String",
      descr: "The email address to send a password reset link."
    }
  ]
};

Template.api.accounts_resetPassword = {
  id: "accounts_resetpassword",
  name: "Accounts.resetPassword(token, newPassword, [callback])",
  locus: "Client",
  descr: ["Reset the password for a user using a token received in email. Logs the user in afterwards."],
  args: [
    {
      name: "token",
      type: "String",
      descr: "The token retrieved from the reset password URL."
    },
    {
      name: "newPassword",
      type: "String",
      descr: "A new password for the user. This is __not__ sent in plain text over the wire."
    },
    {
      name: "callback",
      type: "Function",
      descr: "Optional callback. Called with no arguments on success, or with a single `Error` argument on failure."
    }
  ],
};

Template.api.accounts_setPassword = {
  id: "accounts_setpassword",
  name: "Accounts.setPassword(userId, newPassword)",
  locus: "Server",
  descr: ["Forcibly change the password for a user."],
  args: [
    {
      name: "userId",
      type: "String",
      descr: "The id of the user to update."
    },
    {
      name: "newPassword",
      type: "String",
      descr: "A new password for the user."
    }
  ]
};

Template.api.accounts_verifyEmail = {
  id: "accounts_verifyemail",
  name: "Accounts.verifyEmail(token, [callback])",
  locus: "Client",
  descr: ["Marks the user's email address as verified. Logs the user in afterwards."],
  args: [
    {
      name: "token",
      type: "String",
      descr: "The token retrieved from the verification URL."
    },
    {
      name: "callback",
      type: "Function",
      descr: "Optional callback. Called with no arguments on success, or with a single `Error` argument on failure."
    }
  ]
};


Template.api.accounts_sendResetPasswordEmail = {
  id: "accounts_sendresetpasswordemail",
  name: "Accounts.sendResetPasswordEmail(userId, [email])",
  locus: "Server",
  descr: ["Send an email with a link the user can use to reset their password."],
  args: [
    {
      name: "userId",
      type: "String",
      descr: "The id of the user to send email to."
    },
    {
      name: "email",
      type: "String",
      descr: "Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first email in the list."
    }
  ]
};

Template.api.accounts_sendEnrollmentEmail = {
  id: "accounts_sendenrollmentemail",
  name: "Accounts.sendEnrollmentEmail(userId, [email])",
  locus: "Server",
  descr: ["Send an email with a link the user can use to set their initial password."],
  args: [
    {
      name: "userId",
      type: "String",
      descr: "The id of the user to send email to."
    },
    {
      name: "email",
      type: "String",
      descr: "Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first email in the list."
    }
  ]
};

Template.api.accounts_sendVerificationEmail = {
  id: "accounts_sendverificationemail",
  name: "Accounts.sendVerificationEmail(userId, [email])",
  locus: "Server",
  descr: ["Send an email with a link the user can use verify their email address."],
  args: [
    {
      name: "userId",
      type: "String",
      descr: "The id of the user to send email to."
    },
    {
      name: "email",
      type: "String",
      descr: "Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first unverified email in the list."
    }
  ]
};



Template.api.accounts_emailTemplates = {
  id: "accounts_emailtemplates",
  name: "Accounts.emailTemplates",
  locus: "Anywhere",
  descr: ["Options to customize emails sent from the Accounts system."]
};



Template.api.check = {
  id: "check",
  name: "check(value, pattern)",
  locus: "Anywhere",
  descr: ["Checks that a value matches a [pattern](#matchpatterns). If the value does not match the pattern, throws a `Match.Error`."],
  args: [
    {
      name: "value",
      type: "Any",
      descr: "The value to check"
    },
    {
      name: "pattern",
      type: "Match pattern",
      descr: "The [pattern](#matchpatterns) to match `value` against"
    }
  ]
};

Template.api.match_test = {
  id: "match_test",
  name: "Match.test(value, pattern)",
  locus: "Anywhere",
  descr: ["Returns true if the value matches the [pattern](#matchpatterns)."],
  args: [
    {
      name: "value",
      type: "Any",
      descr: "The value to check"
    },
    {
      name: "pattern",
      type: "Match pattern",
      descr: "The [pattern](#matchpatterns) to match `value` against"
    }
  ]
};

Template.api.matchpatterns = {
  id: "matchpatterns",
  name: "Match patterns"
};

Template.api.setTimeout = {
  id: "meteor_settimeout",
  name: "Meteor.setTimeout(func, delay)",
  locus: "Anywhere",
  descr: ["Call a function in the future after waiting for a specified delay."],
  args: [
    {
      name: "func",
      type: "Function",
      descr: "The function to run"
    },
    {
      name: "delay",
      type: "Number",
      descr: "Number of milliseconds to wait before calling function"
    }
  ]
};

Template.api.setInterval = {
  id: "meteor_setinterval",
  name: "Meteor.setInterval(func, delay)",
  locus: "Anywhere",
  descr: ["Call a function repeatedly, with a time delay between calls."],
  args: [
    {
      name: "func",
      type: "Function",
      descr: "The function to run"
    },
    {
      name: "delay",
      type: "Number",
      descr: "Number of milliseconds to wait between each function call."
    }
  ]
};

Template.api.clearTimeout = {
  id: "meteor_cleartimeout",
  name: "Meteor.clearTimeout(id)",
  locus: "Anywhere",
  descr: ["Cancel a function call scheduled by `Meteor.setTimeout`."],
  args: [
    {
      name: "id",
      type: "Number",
      descr: "The handle returned by `Meteor.setTimeout`"
    }
  ]
};

Template.api.clearInterval = {
  id: "meteor_clearinterval",
  name: "Meteor.clearInterval(id)",
  locus: "Anywhere",
  descr: ["Cancel a repeating function call scheduled by `Meteor.setInterval`."],
  args: [
    {
      name: "id",
      type: "Number",
      descr: "The handle returned by `Meteor.setInterval`"
    }
  ]
};

Template.api.EnvironmentVariable = {
  id: "meteor_environmentvariable",
  name: "new Meteor.EnvironmentVariable()",
  locus: "Anywhere",
  descr: ["Construct a Meteor environment variable."]
};

Template.api.environmentVariable_get = {
  id: "env_var_get",
  name: "<i>env_var</i>.get()",
  locus: "Anywhere",
  descr: ["Return the current value of an EnvironmentVariable."]
};

Template.api.environmentVariable_withValue = {
  id: "env_var_withvalue",
  name: "<i>env_var</i>.withValue(value, func)",
  locus: "Anywhere",
  descr: ["Run `func` with the `env_var`'s value set to `value`."],
  args: [
    {name: "value",
     type: "Anything",
     descr: "Desired value of the environment variable."},
    {name: "func",
     type: "Function",
     descr: "Function to call"}
  ]
};

Template.api.bindEnvironment = {
  id: "env_var_bindenvironment",
  name: "<i>env_var</i>.bindEnvironment(func, onException, _this)",
  locus: "Anywhere",
  descr: ["Return a new function that calls `func` with `this` set to `_this`, and with environment variables set to their current values."],
  args: [
    {name: "func",
     type: "Function",
     descr: "Function to wrap"},
    {name: "onException",
     type: "Function",
     descr: "Function to call if `func` throws an exception.  It expects the thrown exception as its single argument."},
    {name: "_this",
     type: "Object",
     descr: "Value of `this` inside `func`."}
  ]
};

Template.api.set = {
  id: "session_set",
  name: "Session.set(key, value)",
  locus: "Client",
  descr: ["Set a variable in the session. Notify any listeners that the value has changed (eg: redraw templates, and rerun any [`Deps.autorun`](#deps_autorun) computations, that called [`Session.get`](#session_get) on this `key`.)"],
  args: [
    {name: "key",
     type: "String",
     descr: "The key to set, eg, `selectedItem`"},
    {name: "value",
     type: "EJSON-able object or undefined",
     descr: "The new value for `key`"}
  ]
};

Template.api.setDefault = {
  id: "session_set_default",
  name: "Session.setDefault(key, value)",
  locus: "Client",
  descr: ["Set a variable in the session if it is undefined. Otherwise works exactly the same as [`Session.set`](#session_set)."],
  args: [
    {name: "key",
     type: "String",
     descr: "The key to set, eg, `selectedItem`"},
    {name: "value",
     type: "EJSON-able object or undefined",
     descr: "The new value for `key`"}
  ]
};

Template.api.get = {
  id: "session_get",
  name: "Session.get(key)",
  locus: "Client",
  descr: ["Get the value of a session variable. If inside a [reactive computation](#reactivity), invalidate the computation the next time the value of the variable is changed by [`Session.set`](#session_set). This returns a clone of the session value, so if it's an object or an array, mutating the returned value has no effect on the value stored in the session."],
  args: [
    {name: "key",
     type: "String",
     descr: "The name of the session variable to return"}
  ]
};

Template.api.equals = {
  id: "session_equals",
  name: "Session.equals(key, value)",
  locus: "Client",
  descr: ["Test if a session variable is equal to a value. If inside a [reactive computation](#reactivity), invalidate the computation the next time the variable changes to or from the value."],
  args: [
    {name: "key",
     type: "String",
     descr: "The name of the session variable to test"},
    {name: "value",
     type: "String, Number, Boolean, null, or undefined",
     descr: "The value to test against"}
  ]
};

Template.api.httpcall = {
  id: "http_call",
  name: "HTTP.call(method, url [, options] [, asyncCallback])",
  locus: "Anywhere",
  descr: ["Perform an outbound HTTP request."],
  args: [
    {name: "method",
     type: "String",
     descr: 'The HTTP method to use: "`GET`", "`POST`", "`PUT`", or "`DELETE`".'},
    {name: "url",
     type: "String",
     descr: 'The URL to retrieve.'},
    {name: "asyncCallback",
     type: "Function",
     descr: "Optional callback.  If passed, the method runs asynchronously, instead of synchronously, and calls asyncCallback.  On the client, this callback is required."
    }
  ],
  options: [
    {name: "content",
     type: "String",
     descr: "String to use as the HTTP request body."
},
    {name: "data",
     type: "Object",
     descr: "JSON-able object to stringify and use as the HTTP request body. Overwrites `content`."},
    {name: "query",
     type: "String",
     descr: "Query string to go in the URL. Overwrites any query string in `url`."},
    {name: "params",
     type: "Object",
     descr: "Dictionary of request parameters to be encoded and placed in the URL (for GETs) or request body (for POSTs).  If `content` or `data` is specified, `params` will always be placed in the URL."
    },
    {name: "auth",
     type: "String",
     descr: 'HTTP basic authentication string of the form `"username:password"`'},
    {name: "headers",
     type: "Object",
     descr: "Dictionary of strings, headers to add to the HTTP request."},
    {name: "timeout",
     type: "Number",
     descr: "Maximum time in milliseconds to wait for the request before failing.  There is no timeout by default."},
    {name: "followRedirects",
     type: "Boolean",
     descr: "If true, transparently follow HTTP redirects.  Cannot be set to false on the client."}
  ]
};

Template.api.http_get = {
  id: "http_get",
  name: "HTTP.get(url, [options], [asyncCallback])",
  locus: "Anywhere",
  descr: ["Send an HTTP GET request.  Equivalent to `HTTP.call(\"GET\", ...)`."]
};

Template.api.http_post = {
  id: "http_post",
  name: "HTTP.post(url, [options], [asyncCallback])",
  locus: "Anywhere",
  descr: ["Send an HTTP POST request.  Equivalent to `HTTP.call(\"POST\", ...)`."]
};

Template.api.http_put = {
  id: "http_put",
  name: "HTTP.put(url, [options], [asyncCallback])",
  locus: "Anywhere",
  descr: ["Send an HTTP PUT request.  Equivalent to `HTTP.call(\"PUT\", ...)`."]
};

Template.api.http_del = {
  id: "http_del",
  name: "HTTP.del(url, [options], [asyncCallback])",
  locus: "Anywhere",
  descr: ["Send an HTTP DELETE request.  Equivalent to `HTTP.call(\"DELETE\", ...)`.  (Named `del` to avoid conflict with JavaScript's `delete`.)"]
};


// XXX move these up to right place
Template.api.template_call = {
  id: "template_call",
  name: "Template.<em>myTemplate</em>([data])",
  locus: "Client",
  descr: ["Call a template function by name to produce HTML."],
  args: [
    {name: "data",
     type: "Object",
     descr: 'Optional. The data context object with which to call the template.'}
  ]
};

Template.api.template_rendered = {
  id: "template_rendered",
  name: "Template.<em>myTemplate</em>.rendered = function ( ) { ... }",
  locus: "Client",
  descr: ["Provide a callback when an instance of a template is rendered."]
};

Template.api.template_created = {
  id: "template_created",
  name: "Template.<em>myTemplate</em>.created = function ( ) { ... }",
  locus: "Client",
  descr: ["Provide a callback when an instance of a template is created."]
};

Template.api.template_destroyed = {
  id: "template_destroyed",
  name: "Template.<em>myTemplate</em>.destroyed = function ( ) { ... }",
  locus: "Client",
  descr: ["Provide a callback when an instance of a template is destroyed."]
};

Template.api.template_events = {
  id: "template_events",
  name: "Template.<em>myTemplate</em>.events(eventMap)",
  locus: "Client",
  descr: ["Specify event handlers for this template."],
  args: [
    {name: "eventMap",
     type: "Event map",
     type_link: "eventmaps",
     descr: "Event handlers to associate with this template."}
  ]
};

Template.api.template_helpers = {
  id: "template_helpers",
  name: "Template.<em>myTemplate</em>.helpers(helpers)",
  locus: "Client",
  descr: ["Specify template helpers available to this template."],
  args: [
    {name: "helpers",
     type: "Object",
     descr: "Dictionary of helper functions by name."}
  ]
};

Template.api.template_preserve = {
  id: "template_preserve",
  name: "Template.<em>myTemplate</em>.preserve(selectors)",
  locus: "Client",
  descr: ["Specify rules for preserving individual DOM elements on re-render."],
  args: [
    {name: "selectors",
     type: "Array or Object",
     descr: "Array of CSS selectors that each match at most one element, such as `['.thing1', '.thing2']`, or, alternatively, a dictionary of selectors and node-labeling functions (see below)."}
  ]
};

Template.api.template_findAll = {
  id: "template_findAll",
  name: "<em>this</em>.findAll(selector)",
  locus: "Client",
  descr: ["Find all elements matching `selector` in this template instance."],
  args: [
    {name: "selector",
     type: "String",
     descr: 'The CSS selector to match, scoped to the template contents.'}
  ]
};

Template.api.template_find = {
  id: "template_find",
  name: "<em>this</em>.find(selector)",
  locus: "Client",
  descr: ["Find one element matching `selector` in this template instance."],
  args: [
    {name: "selector",
     type: "String",
     descr: 'The CSS selector to match, scoped to the template contents.'}
  ]
};

Template.api.template_firstNode = {
  id: "template_firstNode",
  name: "<em>this</em>.firstNode",
  locus: "Client",
  descr: ["The first top-level DOM node in this template instance."]
};

Template.api.template_lastNode = {
  id: "template_lastNode",
  name: "<em>this</em>.lastNode",
  locus: "Client",
  descr: ["The last top-level DOM node in this template instance."]
};

Template.api.template_data = {
  id: "template_data",
  name: "<em>this</em>.data",
  locus: "Client",
  descr: ["The data context of this instance's latest invocation."]
};

var rfc = function (descr) {
  return '[RFC5322](http://tools.ietf.org/html/rfc5322) ' + descr;
};

Template.api.email_send = {
  id: "email_send",
  name: "Email.send(options)",
  locus: "Server",
  descr: ["Send an email. Throws an `Error` on failure to contact mail " +
          "server or if mail server returns an error."],
  options: [
    {name: "from",
     type: "String",
     descr: rfc('"From:" address (required)')
    },
    {name: "to",
     type: "String or Array of strings",
     descr: rfc('"To:" address[es]')
    },
    {name: "cc",
     type: "String or Array of strings",
     descr: rfc('"Cc:" address[es]')
    },
    {name: "bcc",
     type: "String or Array of strings",
     descr: rfc('"Bcc:" address[es]')
    },
    {name: "replyTo",
     type: "String or Array of strings",
     descr: rfc('"Reply-To:" address[es]')
    },
    {name: "subject",
     type: "String",
     descr: rfc('"Subject:" line')
    },
    {name: "text",
     type: "String",
     descr: rfc('mail body (plain text)')
    },
    {name: "html",
     type: "String",
     descr: rfc('mail body (HTML)')
    },
    {name: "headers",
     type: "Object",
     descr: rfc('custom headers (dictionary)')
    }
  ]
};

Template.api.assets_getText = {
  id: "assets_getText",
  name: "Assets.getText(assetPath, [asyncCallback])",
  locus: "Server",
  descr: ["Retrieve the contents of the static server asset as a UTF8-encoded string."],
  args: [
    {name: "assetPath",
     type: "String",
     descr: "The path of the asset, relative to the application's " +
     "`private` subdirectory."
    },
    {name: "asyncCallback",
     type: "Function",
     descr: "Optional callback, which is called asynchronously with the error " +
     "or result after the function is complete. If not provided, the function " +
     "runs synchronously."
    }
  ]
};

Template.api.assets_getBinary = {
  id: "assets_getBinary",
  name: "Assets.getBinary(assetPath, [asyncCallback])",
  locus: "Server",
  descr: ["Retrieve the contents of the static server asset as an [EJSON Binary](#ejson_new_binary)."],
  args: [
    {name: "assetPath",
     type: "String",
     descr: "The path of the asset, relative to the application's " +
     "`private` subdirectory."
    },
    {name: "asyncCallback",
     type: "Function",
     descr: "Optional callback, which is called asynchronously with the error " +
     "or result after the function is complete. If not provided, the function " +
     "runs synchronously."
    }
  ]
};
