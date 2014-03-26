// RandomStream allows for generation of pseudo-random values, from a seed.
//
// We use this for consistent 'random' numbers across the client and server.  Here,
// we want to generate probably-unique IDs on the client, and we ideally want the server
// to generate the same IDs when it executes the method.
//
// For generated values to be the same, we must seed ourselves the same way,
// and we must keep track of the current state of our pseudo-random generators.
// We call this state the scope. By default, we use the current DDP method invocation as our scope.
// DDP now allows the client to specify a randomSeed.  If a randomSeed is provided it will be used
// to seed our random sequences.  In this way, client and server method calls will generate the same values.
//
// We expose multiple streams, each keyed by a string; each stream is independent and seeded differently
// (but predictably).  By using multiple streams, we support reordering of requests,
// as long as they occur on different streams.
RandomStream = function (options) {
  var self = this;

  this.seed = [].concat(options.seed || randomToken());

  this._sequences = {};
};

// Returns a random string of sufficient length for a random seed.
// This is a placeholder function; a similar function is planned
// for Random itself; when that is added we should remove this function,
// and call Random's randomToken instead.
function randomToken() {
  return Random.hexString(20);
};

DDP.RandomStreams = {};

// Returns the random stream with the specified key.
// This first tries to use the DDP method invocation as the scope;
// if we're not in a method invocation, then we can use fallbackScope instead.
// Otherwise we generate an ephemeral  scope, which will be random,
// but won't produce values that we can easily reproduce elsewhere.
DDP.RandomStreams.get = function (scope, key) {
  if (!key) {
    key = "default";
  }
  if (!scope) {
    // We aren't in a method invocation, there was no scope passed in, so
    // the sequence won't actually be reproducible.
    Meteor._debug("Requested randomStream, but no scope available");
    return Random;
  }
  var randomStream = scope.randomStream;
  if (!randomStream) {
    scope.randomStream = randomStream = new RandomStream({
      seed: scope.randomSeed
    });
  }
  return randomStream._sequence(key);
};

DDP.RandomStreams.makeCollectionId = function (collectionName) {
  if (collectionName) {
    var scope = DDP._CurrentInvocation.get();
    var id = DDP.RandomStreams.get(scope, '/collection/' + collectionName).id();
    return id;
  } else {
    return Random.id();
  }
};

_.extend(RandomStream.prototype, {
  // Get a random sequence with the specified key, creating it if does not exist.
  // New sequences are seeded with the seed concatenated with the key.
  // By passing a seed into Random.create, we use the Alea generator.
  _sequence: function (key) {
    var self = this;

    var sequence = self._sequences[key] || null;
    if (sequence === null) {
      var sequenceSeed = self.seed.concat(key);
      for (var i = 0; i < sequenceSeed.length; i++) {
        if (_.isFunction(sequenceSeed[i])) {
          sequenceSeed[i] = sequenceSeed[i]();
        }
      }
      self._sequences[key] = sequence = Random.createWithSeeds.apply(null, sequenceSeed);
    }
    return sequence;
  }
});
