Template.api.is_client = {
  id: "meteor_is_client",
  name: "Meteor.is_client",
  locus: "Anywhere",
  descr: ["Boolean variable.  True if running in client environment."]
};

Template.api.is_server = {
  id: "meteor_is_server",
  name: "Meteor.is_server",
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
     descr: "Function called on the server each time a client subscribes.  Inside function, `this` is the publish handler object, described below.  If the client passed arguments to `subscribe`, the function is called with the same arguments."}
  ]
};

Template.api.subscription_set = {
  id: "publish_set",
  name: "<i>this</i>.set(collection, id, name, value)",
  locus: "Server",
  descr: ["Call inside publish function.  Queues a command to set attributes."],
  args: [
    {name: "collection",
     type: "String",
     descr: "The name of the collection that should be affected."
    },
    {name: "id",
     type: "String",
     descr: "The ID of the document that should be affected."
    },
    {name: "attributes",
     type: "Object",
     descr: "Dictionary of attribute keys and their values."
    }
  ]
};

Template.api.subscription_unset = {
  id: "publish_unset",
  name: "<i>this</i>.unset(collection, id, keys)",
  locus: "Server",
  descr: ["Call inside publish function.  Queues a command to unset attributes."],
  args: [
    {name: "collection",
     type: "String",
     descr: "The name of the collection that should be affected."
    },
    {name: "id",
     type: "String",
     descr: "The ID of the document that should be affected."
    },
    {name: "keys",
     type: "Array",
     descr: "Array of attribute keys."
    }
  ]
};

Template.api.subscription_complete = {
  id: "publish_complete",
  name: "<i>this</i>.complete()",
  locus: "Server",
  descr: ["Call inside publish function.  Queues a command to mark this subscription as complete (initial attributes are set)."]
};

Template.api.subscription_flush = {
  id: "publish_flush",
  name: "<i>this</i>.flush()",
  locus: "Server",
  descr: ["Call inside publish function.  Sends all the pending set, unset, and complete messages to the client."]
};

Template.api.subscription_stop = {
  id: "publish_stop",
  name: "<i>this</i>.stop()",
  locus: "Server",
  descr: ["Call inside publish function.  Stops this client's subscription."]
};

Template.api.subscription_onStop = {
  id: "publish_onstop",
  name: "<i>this</i>.onStop(func)",
  locus: "Server",
  descr: ["Call inside publish function.  Registers a callback function to run when the subscription is stopped."],
  args: [
    {name: "func",
     type: "Function",
     descr: "The callback function"
    }
  ]
};

Template.api.subscribe = {
  id: "meteor_subscribe",
  name: "Meteor.subscribe(name [, arg1, arg2, ... ] [, onComplete])",
  locus: "Client",
  descr: ["Subscribe to a record set.  Returns a handle that provides a stop() method, which will stop the subscription."],
  args: [
    {name: "name",
     type: "String",
     descr: "Name of the subscription.  Matches name of server's publish() call."},
    {name: "arg1, arg2, ...",
     type: "Any",
     descr: "Optional arguments passed to publisher function on server."},
    {name: "onComplete",
     type: "Function",
     descr: "If the last argument is a Function, it is called without arguments when the server marks the subscription as complete."}
  ]
};

Template.api.autosubscribe = {
  id: "meteor_autosubscribe",
  name: "Meteor.autosubscribe(func)",
  locus: "Client",
  descr: ["Automatically set up and tear down subscriptions."],
  args: [
    {name: "func",
     type: "Function",
     descr: "A [`reactive`](#reactivity) function that sets up some subscriptions by calling [`Meteor.subscribe`](#meteor_subscribe). It will automatically be re-run when its dependencies change."}
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

Template.api.method_invocation_unblock = {
  id: "method_unblock",
  name: "<i>this</i>.unblock()",
  locus: "Server",
  descr: ["Call inside method invocation.  Allow subsequent method from this client to begin running in a new fiber."]
};

Template.api.method_invocation_is_simulation = {
  id: "method_is_simulation",
  name: "<i>this</i>.is_simulation",
  locus: "Anywhere",
  descr: ["Access inside method invocation.  Boolean value, true if this invocation is a stub."]
};

Template.api.error = {
  id: "meteor_error",
  name: "new Meteor.Error(error, reason, details)",
  locus: "Anywhere",
  descr: ["This class represents a symbolic error thrown by a method."],
  args: [
    {name: "error",
     type: "Number",
     descr: "A numeric error code, likely similar to a HTTP code (eg, 404, 500)."},
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
  name: "Meteor.call(func, arg1, arg2, ... [, asyncCallback])",
  locus: "Anywhere",
  descr: ["Invokes a method passing any number of arguments."],
  args: [
    {name: "func",
     type: "String",
     descr: "Name of method to invoke"},
    {name: "arg1, arg2, ...",
     type: "JSON",
     descr: "Optional method arguments"},
    {name: "asyncCallback",
     type: "Function",
     descr: "Optional callback.  If passed, the method runs asynchronously, instead of synchronously, and calls asyncCallback passing either the error or the result."}
  ]
};

Template.api.meteor_apply = {
  id: "meteor_apply",
  name: "Meteor.apply(name, params [, asyncCallback])",
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
     descr: "Optional callback.  If passed, the method runs asynchronously, instead of synchronously, and calls asyncCallback passing either the error or the result."}
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

Template.api.connect = {
  id: "meteor_connect",
  name: "Meteor.connect(url)",
  locus: "Client",
  descr: ["Connect to the server of a different Meteor application to subscribe to its document sets and invoke its remote methods."],
  args: [
    {name: "url",
     type: "String",
     descr: "The URL of another Meteor application."}
  ]
};

// onAutopublish
// onQuiesce

Template.api.meteor_collection = {
  id: "meteor_collection",
  name: "new Meteor.Collection(name, manager)", // driver undocumented
  locus: "Anywhere",
  descr: ["Constructor for a Collection"],
  args: [
    {name: "name",
     type: "String",
     descr: "The name of the collection.  If null, creates an unmanaged (unsynchronized) local collection."},
    {name: "manager",
     type: "Object",
     descr: "The Meteor connection that will manage this collection, defaults to `Meteor` if null.  Unmanaged (`name` is null) collections cannot specify a manager."
    }
    // driver
  ]
};

Template.api.find = {
  id: "find",
  name: "<em>collection</em>.find(selector, [options])",
  locus: "Anywhere",
  descr: ["Find the documents in a collection that match the selector."],
  args: [
    {name: "selector",
     type: "Object &mdash; Mongo selector, or String",
     type_link: "selectors",
     descr: "The query"}
  ],
  options: [
    {name: "sort",
     type: "Object &mdash; sort specifier",
     type_link: "sortspecifiers",
     descr: "Sort order (default: natural order)"},
    {name: "skip",
     type: "Number",
     descr: "Number of result to skip at the beginning"},
    {name: "limit",
     type: "Number",
     descr: "Maximum number of results to return"},
    {name: "reactive",
     type: "Boolean",
     descr: "Default true; pass false to disable reactivity"}
  ]
};

Template.api.findone = {
  id: "findone",
  name: "<em>collection</em>.findOne(selector, [options])",
  locus: "Anywhere",
  descr: ["Finds the first document that matches the selector, as ordered by sort and skip options."],
  args: [
    {name: "selector",
     type: "Object &mdash; Mongo selector, or String",
     type_link: "selectors",
     descr: "The query"}
  ],
  options: [
    {name: "sort",
     type: "Object &mdash; sort specifier",
     type_link: "sortspecifiers",
     descr: "Sort order (default: natural order)"},
    {name: "skip",
     type: "Number",
     descr: "Number of result to skip at the beginning"},
    {name: "reactive",
     type: "Boolean",
     descr: "Default true; pass false to disable reactivity"}
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
  name: "<em>cursor</em>.forEach(callback)",
  locus: "Anywhere",
  descr: ["Call the callback function once for each matching document."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "Function to call."}
  ]
};

Template.api.cursor_map = {
  id: "map",
  name: "<em>cursor</em>.map(callback)",
  locus: "Anywhere",
  descr: ["Map callback over all matching documents.  Returns an Array."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "Function to call."}
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
  locus: "Client",
  descr: ["Watch a query.  Receive callbacks as the result set changes."],
  args: [
    {name: "callbacks",
     type: "Object (may include added, changed, moved, removed callbacks)",
     descr: "Functions to call to deliver the result set as it changes"}
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
     descr: "The document to insert. Should not yet have an _id attribute."},
    {name: "callback",
     type: "Function",
     descr: "Optional.  If present, called with an error object as the first argument and, if no error, the _id as the second."}
  ]
};

Template.api.update = {
  id: "update",
  name: "<em>collection</em>.update(selector, modifier, [options], [callback])",
  locus: "Anywhere",
  descr: ["Modify one or more documents in the collection"],
  args: [
    {name: "selector",
     type: "Object &mdash; Mongo selector, or String",
     type_link: "selectors",
     descr: "Specifies which documents to modify"},
    {name: "modifier",
     type: "Object &mdash; Mongo modifier",
     type_link: "modifiers",
     descr: "Specifies how to modify the documents"},
    {name: "callback",
     type: "Function",
     descr: "Optional.  If present, called with an error object as its argument."}
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
     type: "Object &mdash; Mongo selector, or String",
     type_link: "selectors",
     descr: "Specifies which documents to remove"},
    {name: "callback",
     type: "Function",
     descr: "Optional.  If present, called with an error object as its argument."}
  ]
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

Template.api.Context = {
  id: "context",
  name: "new Meteor.deps.Context",
  locus: "Client",
  descr: ["Create an invalidation context. Invalidation contexts are used to run a piece of code, and record its dependencies so it can be rerun later if one of its inputs changes.", "An invalidation context is basically just a list of callbacks for an event that can fire only once. The [`on_invalidate`](#on_invalidate) method adds a callback to the list, and the [`invalidate`](#invalidate) method fires the event."]
};

Template.api.current = {
  id: "current",
  name: "Meteor.deps.Context.current",
  locus: "Client",
  descr: ["The current [`invalidation context`](#context), or `null` if not being called from inside [`run`](#run)."]
};

Template.api.run = {
  id: "run",
  name: "<em>context</em>.run(func)",
  locus: "Client",
  descr: ["Run some code inside an evaluation context."],
  args: [
    {name: "func",
     type: "Function",
     descr: "The code to run"}
  ]
};

Template.api.on_invalidate = {
  id: "on_invalidate",
  name: "<em>context</em>.on_invalidate(callback)",
  locus: "Client",
  descr: ["Registers `callback` to be called when this context is invalidated. `callback` will be run exactly once."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "Function to be called on invalidation. Receives one argument, the context that was invalidated"}
  ]
};

Template.api.invalidate = {
  id: "invalidate",
  name: "<em>context</em>.invalidate()",
  locus: "Client",
  descr: ["Add this context to the list of contexts that will have their `on_invalidate|on_invalidate` callbacks called by the next call to [`Meteor.flush`](#meteor_flush)."]
};


// writeFence
// invalidationCrossbar

Template.api.render = {
  id: "meteor_ui_render",
  name: "Meteor.ui.render(html_func, [options])",
  locus: "Client",
  descr: ["Create DOM nodes that automatically update themselves as data changes."],
  args: [
    {name: "html_func",
     type: "Function returning a string of HTML",
     descr: "Render function to be called, initially and whenever data changes"}
  ],
  options: [
    {name: "events",
     type: "Object &mdash; event map",
     type_link: "eventmaps",
     descr: "Events to hook up to the rendered elements"},
    {name: "event_data",
     type: "Any value",
     descr: "Value to bind to `this` in event handlers"
    }
  ]
};

Template.api.chunk = {
  id: "meteor_ui_chunk",
  name: "Meteor.ui.chunk(html_func, [options])",
  locus: "Client",
  descr: ["Inside [`Meteor.ui.render`](#meteor_ui_render), give special behavior to a range of HTML."],
  args: [
    {name: "html_func",
     type: "Function returning a string of HTML",
     descr: "Render function to be called, initially and whenever data changes"}
  ],
  options: [
    {name: "events",
     type: "Object &mdash; event map",
     type_link: "eventmaps",
     descr: "Events to hook up to the rendered elements"},
    {name: "event_data",
     type: "Any value",
     descr: "Value to bind to `this` in event handlers"
    }
  ]
};

Template.api.listChunk = {
  id: "meteor_ui_listchunk",
  name: "Meteor.ui.listChunk(observable, doc_func, [else_func], [options])",
  locus: "Client",
  descr: ["Observe a database query and create annotated HTML that will be reactively updated when rendered with [`Meteor.ui.render`](#meteor_ui_render)."],
  args: [
    {name: "observable",
     type: "Cursor",
     type_link: "meteor_collection_cursor",
     descr: "Query cursor to observe, as a reactive source of ordered documents"},
    {name: "doc_func",
     type: "Function taking a document and returning HTML",
     descr: "Render function to be called for each document"},
    {name: "else_func",
     type: "Function returning HTML",
     descr: "Render function to be called when query is empty"}
  ],
  options: [
    {name: "events",
     type: "Object &mdash; event map",
     type_link: "eventmaps",
     descr: "Events to hook up to the rendered elements"}
  ]
};

Template.api.flush = {
  id: "meteor_flush",
  name: "Meteor.flush()",
  locus: "Client",
  descr: ["Ensure that any reactive updates have finished. Allow auto-updating DOM element to be cleaned up if they are offscreen."]
};

Template.api.eventmaps = {
  id: "eventmaps",
  name: "Event Maps"
};

Template.api.setTimeout = {
  id: "meteor_settimeout",
  name: "Meteor.setTimeout",
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
  name: "Meteor.setInterval",
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
  name: "Meteor.clearTimeout",
  locus: "Anywhere",
  descr: ["Cancel a function call scheduled by `Meteor.setTimeout`."],
  args: [
    {
      name: "id",
      type: "Number",
      descr: "The handle returned from setTimeout"
    }
  ]
};

Template.api.clearInterval = {
  id: "meteor_clearinterval",
  name: "Meteor.clearInterval",
  locus: "Anywhere",
  descr: ["Cancel a repeating function call scheduled by `Meteor.setInterval`."],
  args: [
    {
      name: "id",
      type: "Number",
      descr: "The handle returned from setInterval"
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
  descr: ["Set a variable in the session. Notify any listeners that the value has changed (eg: redraw templates, and rerun any [`Meteor.autosubscribe`](#meteor_autosubscribe) blocks, that called [`Session.get`](#session_get) on this `key`.)"],
  args: [
    {name: "key",
     type: "String",
     descr: "The key to set, eg, `selected_item`"},
    {name: "value",
     type: "Any type",
     descr: "The new value for `key`"}
  ]
};

Template.api.get = {
  id: "session_get",
  name: "Session.get(key)",
  locus: "Client",
  descr: ["Get the value of a session variable. If inside a [`Meteor.deps`](#meteor_deps) context, invalidate the context the next time the value of the variable is changed by [`Session.set`](#session_set)."],
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
  descr: ["Test if a session variable is equal to a value. If inside a [`Meteor.deps`](#meteor_deps) context, invalidate the context the next time the variable changes to or from the value."],
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
  id: "meteor_http_call",
  name: "Meteor.http.call(method, url, [options], [asyncCallback])",
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
  id: "meteor_http_get",
  name: "Meteor.http.get(url, [options], [asyncCallback])",
  locus: "Anywhere",
  descr: ["Send an HTTP GET request.  Equivalent to `Meteor.http.call(\"GET\", ...)`."]
};

Template.api.http_post = {
  id: "meteor_http_post",
  name: "Meteor.http.post(url, [options], [asyncCallback])",
  locus: "Anywhere",
  descr: ["Send an HTTP POST request.  Equivalent to `Meteor.http.call(\"POST\", ...)`."]
};

Template.api.http_put = {
  id: "meteor_http_put",
  name: "Meteor.http.put(url, [options], [asyncCallback])",
  locus: "Anywhere",
  descr: ["Send an HTTP PUT request.  Equivalent to `Meteor.http.call(\"PUT\", ...)`."]
};

Template.api.http_del = {
  id: "meteor_http_del",
  name: "Meteor.http.del(url, [options], [asyncCallback])",
  locus: "Anywhere",
  descr: ["Send an HTTP DELETE request.  Equivalent to `Meteor.http.call(\"DELETE\", ...).  (Named `del` to avoid conflict with JavaScript's `delete``."]
};


