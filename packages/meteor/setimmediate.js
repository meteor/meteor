/**
 * Make sure that `setImmediate` works both on the server and the client. Uses a microtask in the client.
 */
Meteor._setImmediate = Meteor.isServer ? setImmediate : fn => Promise.resolve().then(fn)
