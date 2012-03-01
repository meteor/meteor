// Allow a little bit of formatting in API box description strings..
// `code`
// `code|section_anchor_for_link`
// `=not code|section_anchor_or_link`
//
// obviously this is a huge mess and needs to get plowed under
Template.api_box.pretty =
Template.api_box_args.pretty = function (fn) {
  var raw = fn(this);
  var parts = raw.split(/&#x60;|`/);
  var in_backtick = true;
  return _.map(parts, function (p) {
    in_backtick = !in_backtick;
    if (!in_backtick)
      return p;
    var x = p.split('|');
    var ret = x[0];
    var is_code = true;
    if (ret[0] === '=') {
      is_code = false;
      ret = ret.substr(1);
    }
    if (x.length > 1)
      ret = "<a href='#" + x[1] + "'>" + ret + "</a>";
    if (is_code)
      ret = "<code>" + ret + "</code>";
    return ret;
  }).join('');
};

// Meteor boxes

Template.api.publish = {
  id: "publish",
  name: "Meteor.publish(name, handler)",
  locus: "Server",
  descr: [
    "Define a live dataset to which clients may subscribe.  If `name` is a String, a client can subscribe to the dataset with `Meteor.subscribe|subscribe`.  If `name` is falsey, every client is automatically subscribed at connection time.  The `handler` argument is a publish function, called at subscription or connection time, that is expected to send data events to the client.",
    "Calls to this function are ignored on the client."],
  args: [
    {name: "name",
     type: "String",
     descr: "The name that clients will use to subscribe to this query."},
    {name: "handler",
     type: "Function",
     descr: "The publish function that emits data messages."}]
};

Template.api.subscribe = {
  id: "subscribe",
  name: "Meteor.subscribe(name, [params], [on_ready])",
  locus: "Client",
  descr: ["Subscribe, in realtime, to a dataset being published by the server. Insert the data automatically in the appropriate local collections."],
  args: [
    {name: "name",
     type: "String",
     descr: "The name of the dataset being published by the server. Must match `name` passed to `Meteor.publish|publish` on the server."},
    {name: "params",
     type: "Object",
     descr: "Arbitrary parameters to pass to the publication function on the server. May contain any JSON-compatible types."},
    {name: "on_ready",
     type: "Function",
     descr: "Function to call once the initial load of the data has completed."}
  ]
};

Template.api.autosubscribe = {
  id: "autosubscribe",
  name: "Meteor.autosubscribe(func)",
  locus: "Client",
  descr: ["Automatically set up and tear down subscriptions."],
  args: [
    {name: "func",
     type: "Function",
     descr: "A `=reactive|reactivity` function that sets up some subscriptions by calling `Meteor.subscribe|subscribe`. It will automatically be re-run when its dependencies change."}
    ]
};

Template.api.startup = {
  id: "startup",
  name: "Meteor.startup(func)",
  locus: "Anywhere",
  descr: ["Run code when a client or a server starts."],
  args: [
    {name: "func",
     type: "Function",
     descr: "A function to run on startup."}
  ]
};

Template.api.flush = {
  id: "flush",
  name: "Meteor.flush()",
  locus: "Client",
  descr: ["Ensure than any reactive updates have finished. Allow auto-updating DOM element to be cleaned up if they are offscreen."]
};

Template.api.status = {
  id: "status",
  name: "Meteor.status()",
  locus: "Client",
  descr: ["Get the current connection status. A reactive data source."]
};

Template.api.reconnect = {
  id: "reconnect",
  name: "Meteor.reconnect()",
  locus: "Client",
  descr: [
    "Force an immediate reconnection attempt if the client is not connected to the server",
    "If the client is already connected this method does nothing."]
};


// Collection boxes

Template.api.collection = {
  id: "create_collection",
  name: "new Meteor.Collection([name])",
  locus: "Anywhere",
  descr: ["Create a MongoDB-style collection that can be used to store data."],
  args: [
    {name: "name",
     type: "String (optional)",
     descr: "The name of the server-side Mongo collection in which to store the data. If not given, creates a temporary, local, non-persistent collection."}
  ]
};

Template.api.find = {
  id: "find",
  name: "<em>collection</em>.find(selector, [options])",
  locus: "Anywhere",
  descr: ["Defines a query of documents in a collection that match a selector.  Does not execute the query."],
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
     descr: "Number of result to skip at the beginnig"},
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
  descr: ["Returns the first document matching selector, as ordered by sort and skip options."],
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
     descr: "Number of result to skip at the beginnig"},
    {name: "reactive",
     type: "Boolean",
     descr: "Default true; pass false to disable reactivity"}
  ]
};

Template.api.cursor_count = {
  id: "cursorcount",
  name: "<em>cursor</em>.count()",
  locus: "Anywhere",
  descr: ["Returns the count of documents matched by a query."],
  args: [ ],
};

Template.api.cursor_fetch = {
  id: "cursorfetch",
  name: "<em>cursor</em>.fetch()",
  locus: "Anywhere",
  descr: ["Returns the array of documents matching the query."],
  args: [ ]
};

Template.api.cursor_foreach = {
  id: "cursorforeach",
  name: "<em>cursor</em>.forEach(callback)",
  locus: "Anywhere",
  descr: ["Iterates over all matching documents."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "Function to call, supplying each matching document as its single argument."}
  ]
};

Template.api.cursor_map = {
  id: "cursormap",
  name: "<em>cursor</em>.map(callback)",
  locus: "Anywhere",
  descr: ["Map over all matching documents, returning Array."],
  args: [
    {name: "callback",
     type: "Function",
     descr: "Function to call, supplying each matching document as its single argument."}
  ]
};

Template.api.cursor_rewind = {
  id: "cursorrewind",
  name: "<em>cursor</em>.rewind()",
  locus: "Anywhere",
  descr: ["Resets the query cursor."],
  args: [ ]
};

Template.api.cursor_observe = {
  id: "cursorobserve",
  name: "<em>cursor</em>.observe(options)",
  locus: "Client",
  descr: ["Continuously query a collection for documents that match a selector. Receive callbacks as the result set changes."],
  args: [
    {name: "callbacks",
     type: "Object (may include added, changed, moved, removed callbacks)",
     descr: "Functions to call to deliver the result set as it changes"}
  ]
};

Template.api.insert = {
  id: "insert",
  name: "<em>collection</em>.insert(doc)",
  locus: "Anywhere",
  descr: ["Insert a document in the collection"],
  args: [
    {name: "doc",
     type: "Object",
     descr: "The document to insert. Should not yet have an _id attribute."}
  ]
};

Template.api.update = {
  id: "update",
  name: "<em>collection</em>.update(selector, modifier, [options])",
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
  ],
  options: [
    {name: "multi",
     type: "Boolean",
     descr: "True to modify all matching documents; false to only modify one of the matching documents (the default)."}
  ]
};

Template.api.remove = {
  id: "remove",
  name: "<em>collection</em>.remove(selector)",
  locus: "Anywhere",
  descr: ["Remove documents from the collection"],
  args: [
    {name: "selector",
     type: "Object &mdash; Mongo selector, or String",
     type_link: "selectors",
     descr: "Specifies which documents to remove"}
  ]
};

// Session boxes

Template.api.set = {
  id: "set",
  name: "Session.set(key, value)",
  locus: "Client",
  descr: ["Set a variable in the session. Notify any listeners that the value has changed (eg: redraw templates, and rerun any `Meteor.autosubscribe|autosubscribe` blocks, that called `Session.get|get` on this `key`.)"],
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
  id: "get",
  name: "Session.get(key)",
  locus: "Client",
  descr: ["Get the value of a session variable. If inside a `Meteor.monitor|monitor` block, invalidate the block the next time the value of the variable is changed by `Session.set|set`."],
  args: [
    {name: "key",
     type: "String",
     descr: "The name of the session variable to return"}
  ]
};

Template.api.equals = {
  id: "equals",
  name: "Session.equals(key, value)",
  locus: "Client",
  descr: ["Test if a session variable is equal to a value. If inside a `Meteor.monitor|monitor` block, invalidate the block the next time the variable changes to or from the value."],
  args: [
    {name: "key",
     type: "String",
     descr: "The name of the session variable to test"},
    {name: "value",
     type: "String, Number, Boolean, null, or undefined",
     descr: "The value to test against"}
  ]
};

// Meteor.ui boxes

Template.api.render = {
  id: "render",
  name: "Meteor.ui.render(render_func, [events], [event_data])",
  locus: "Client",
  descr: ["Create reactive DOM elements that automatically update themselves as data changes in the database or session variables."],
  args: [
    {name: "render_func",
     type: "Function returning a DOM element, an array of DOM elements, a DocumentFragment, a jQuery-style result set, or a string",
     descr: "Function that renders the DOM elements"},
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

Template.api.renderList = {
  id: "renderlist",
  name: "Meteor.ui.renderList(collection, options)",
  locus: "Client",
  descr: ["Do a database query and repeat a template for each result. Keep the query running constantly, and return reactive DOM elements that automatically update themselves as the results of the query change."],
  args: [
    {name: "collection",
     type: "Collection",
     type_link: "collection",
     descr: "The collection to query"}],
  options: [
    {name: "render",
     type: "Function (required)", // XXX document that it's reactive
     descr: "Takes a document from the collection and returns a DOM element"},
    {name: "render_empty",
     type: "Function",
     descr: "Return something to show when the query has no results"},
    {name: "selector",
     type: "Object &mdash; Mongo selector",
     type_link: "selectors",
     descr: "Filter (default: `{}`, all records)"},
    {name: "sort",
     type: "Object &mdash; sort specifier",
     type_link: "sortspecifiers",
     descr: "Ordering (default: natural order in the database)"},
    {name: "events",
     type: "Object &mdash; event map",
     type_link: "eventmaps",
     descr: "Events to hook up to each rendered element"}
  ]
};

// Meteor.deps boxes

Template.api.Context = {
  id: "context",
  name: "new Meteor.deps.Context",
  locus: "Client",
  descr: ["Create an invalidation context. Invalidation contexts are used to run a piece of code, and record its dependencies so it can be rerun later if one of its inputs changes.", "An invalidation context is basically just a list of callbacks for an event that can fire only once. The `on_invalidate|on_invalidate` method adds a callback to the list, and the `invalidate|invalidate` method fires the event."]
};

Template.api.current = {
  id: "current",
  name: "Meteor.deps.Context.current",
  locus: "Client",
  descr: ["The current `invalidation context|context`, or `null` if not being called from inside `run|run`."]
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
  descr: ["Add this context to the list of contexts that will have their `on_invalidate|on_invalidate` callbacks called by the next call to `Meteor.flush|flush`."]
};
