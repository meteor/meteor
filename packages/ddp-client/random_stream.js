import { DDP } from "./namespace.js";

// Returns the named sequence of pseudo-random values.
// The scope will be DDP._CurrentMethodInvocation.get(), so the stream will produce
// consistent values for method calls on the client and server.
DDP.randomStream = function (name) {
  var scope = DDP._CurrentMethodInvocation.get();
  return DDPCommon.RandomStream.get(scope, name);
};


