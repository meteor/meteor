// Returns the named sequence of pseudo-random values.
// The scope will be DDP._CurrentInvocation.get(), so the stream will produce
// consistent values for method calls on the client and server.
DDP.randomStream = function (name) {
  var scope = DDP._CurrentInvocation.get();
  return DDPCommon.RandomStream.get(scope, name);
};


