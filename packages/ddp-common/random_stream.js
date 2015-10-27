// RandomStream allows for generation of pseudo-random values, from a seed.
//
// We use this for consistent 'random' numbers across the client and server.
// We want to generate probably-unique IDs on the client, and we ideally want
// the server to generate the same IDs when it executes the method.
//
// For generated values to be the same, we must seed ourselves the same way,
// and we must keep track of the current state of our pseudo-random generators.
// We call this state the scope. By default, we use the current DDP method
// invocation as our scope.  DDP now allows the client to specify a randomSeed.
// If a randomSeed is provided it will be used to seed our random sequences.
// In this way, client and server method calls will generate the same values.
//
// We expose multiple named streams; each stream is independent
// and is seeded differently (but predictably from the name).
// By using multiple streams, we support reordering of requests,
// as long as they occur on different streams.
//
// @param options {Optional Object}
//   seed: Array or value - Seed value(s) for the generator.
//                          If an array, will be used as-is
//                          If a value, will be converted to a single-value array
//                          If omitted, a random array will be used as the seed.
DDPCommon.RandomStream = function (options) {
  var self = this;

  this.seed = [].concat(options.seed || randomToken());

  this.sequences = {};
};

// Returns a random string of sufficient length for a random seed.
// This is a placeholder function; a similar function is planned
// for Random itself; when that is added we should remove this function,
// and call Random's randomToken instead.
function randomToken() {
  return Random.hexString(20);
};

// Returns the random stream with the specified name, in the specified
// scope. If a scope is passed, then we use that to seed a (not
// cryptographically secure) PRNG using the fast Alea algorithm.  If
// scope is null (or otherwise falsey) then we use a generated seed.
//
// However, scope will normally be the current DDP method invocation,
// so we'll use the stream with the specified name, and we should get
// consistent values on the client and server sides of a method call.
DDPCommon.RandomStream.get = function (scope, name) {
  if (!name) {
    name = "default";
  }
  if (!scope) {
    // There was no scope passed in; the sequence won't actually be
    // reproducible. but make it fast (and not cryptographically
    // secure) anyways, so that the behavior is similar to what you'd
    // get by passing in a scope.
    return Random.insecure;
  }
  var randomStream = scope.randomStream;
  if (!randomStream) {
    scope.randomStream = randomStream = new DDPCommon.RandomStream({
      seed: scope.randomSeed
    });
  }
  return randomStream._sequence(name);
};


// Creates a randomSeed for passing to a method call.
// Note that we take enclosing as an argument,
// though we expect it to be DDP._CurrentInvocation.get()
// However, we often evaluate makeRpcSeed lazily, and thus the relevant
// invocation may not be the one currently in scope.
// If enclosing is null, we'll use Random and values won't be repeatable.
DDPCommon.makeRpcSeed = function (enclosing, methodName) {
  var stream = DDPCommon.RandomStream.get(enclosing, '/rpc/' + methodName);
  return stream.hexString(20);
};

_.extend(DDPCommon.RandomStream.prototype, {
  // Get a random sequence with the specified name, creating it if does not exist.
  // New sequences are seeded with the seed concatenated with the name.
  // By passing a seed into Random.create, we use the Alea generator.
  _sequence: function (name) {
    var self = this;

    var sequence = self.sequences[name] || null;
    if (sequence === null) {
      var sequenceSeed = self.seed.concat(name);
      for (var i = 0; i < sequenceSeed.length; i++) {
        if (_.isFunction(sequenceSeed[i])) {
          sequenceSeed[i] = sequenceSeed[i]();
        }
      }
      self.sequences[name] = sequence = Random.createWithSeeds.apply(null, sequenceSeed);
    }
    return sequence;
  }
});
