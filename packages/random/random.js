// We use cryptographically strong PRNGs (crypto.getRandomBytes() on the server,
// window.crypto.getRandomValues() in the browser) when available. If these
// PRNGs fail, we fall back to the Alea PRNG, which is not cryptographically
// strong, and we seed it with various sources such as the date, Math.random,
// and window size on the client.  When using crypto.getRandomValues(), our
// primitive is hexString(), from which we construct fraction(). When using
// window.crypto.getRandomValues() or alea, the primitive is fraction and we use
// that to construct hex string.

if (Meteor.isServer)
  var nodeCrypto = Npm.require('crypto');

// see http://baagoe.org/en/wiki/Better_random_numbers_for_javascript
// for a full discussion and Alea implementation.
var Alea = function () {
  function Mash() {
    var n = 0xefc8249d;

    var mash = function(data) {
      data = data.toString();
      for (var i = 0; i < data.length; i++) {
        n += data.charCodeAt(i);
        var h = 0.02519603282416938 * n;
        n = h >>> 0;
        h -= n;
        h *= n;
        n = h >>> 0;
        h -= n;
        n += h * 0x100000000; // 2^32
      }
      return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
    };

    mash.version = 'Mash 0.9';
    return mash;
  }

  return (function (args) {
    var s0 = 0;
    var s1 = 0;
    var s2 = 0;
    var c = 1;

    if (args.length == 0) {
      args = [+new Date];
    }
    var mash = Mash();
    s0 = mash(' ');
    s1 = mash(' ');
    s2 = mash(' ');

    for (var i = 0; i < args.length; i++) {
      s0 -= mash(args[i]);
      if (s0 < 0) {
        s0 += 1;
      }
      s1 -= mash(args[i]);
      if (s1 < 0) {
        s1 += 1;
      }
      s2 -= mash(args[i]);
      if (s2 < 0) {
        s2 += 1;
      }
    }
    mash = null;

    var random = function() {
      var t = 2091639 * s0 + c * 2.3283064365386963e-10; // 2^-32
      s0 = s1;
      s1 = s2;
      return s2 = t - (c = t | 0);
    };
    random.uint32 = function() {
      return random() * 0x100000000; // 2^32
    };
    random.fract53 = function() {
      return random() +
        (random() * 0x200000 | 0) * 1.1102230246251565e-16; // 2^-53
    };
    random.version = 'Alea 0.9';
    random.args = args;
    return random;

  } (Array.prototype.slice.call(arguments)));
};

var UNMISTAKABLE_CHARS = "23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz";
var BASE64_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "0123456789-_";

// `type` is one of `RandomGenerator.Type` as defined below.
//
// options:
// - seeds: (required, only for RandomGenerator.Type.ALEA) an array
//   whose items will be `toString`ed and used as the seed to the Alea
//   algorithm
var RandomGenerator = function (type, options) {
  var self = this;
  self.type = type;

  if (!RandomGenerator.Type[type]) {
    throw new Error("Unknown random generator type: " + type);
  }

  if (type === RandomGenerator.Type.ALEA) {
    if (!options.seeds) {
      throw new Error("No seeds were provided for Alea PRNG");
    }
    self.alea = Alea.apply(null, options.seeds);
  }
};

// Types of PRNGs supported by the `RandomGenerator` class
RandomGenerator.Type = {
  // Use Node's built-in `crypto.getRandomBytes` (cryptographically
  // secure but not seedable, runs only on the server). Reverts to
  // `crypto.getPseudoRandomBytes` in the extremely uncommon case that
  // there isn't enough entropy yet
  NODE_CRYPTO: "NODE_CRYPTO",

  // Use non-IE browser's built-in `window.crypto.getRandomValues`
  // (cryptographically secure but not seedable, runs only in the
  // browser).
  BROWSER_CRYPTO: "BROWSER_CRYPTO",

  // Use the *fast*, seedaable and not cryptographically secure
  // Alea algorithm
  ALEA: "ALEA",
};

RandomGenerator.prototype.fraction = function () {
  var self = this;
  if (self.type === RandomGenerator.Type.ALEA) {
    return self.alea();
  } else if (self.type === RandomGenerator.Type.NODE_CRYPTO) {
    var numerator = parseInt(self.hexString(8), 16);
    return numerator * 2.3283064365386963e-10; // 2^-32
  } else if (self.type === RandomGenerator.Type.BROWSER_CRYPTO) {
    var array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] * 2.3283064365386963e-10; // 2^-32
  } else {
    throw new Error('Unknown random generator type: ' + self.type);
  }
};

RandomGenerator.prototype.hexString = function (digits) {
  var self = this;
  if (self.type === RandomGenerator.Type.NODE_CRYPTO) {
    var numBytes = Math.ceil(digits / 2);
    var bytes;
    // Try to get cryptographically strong randomness. Fall back to
    // non-cryptographically strong if not available.
    try {
      bytes = nodeCrypto.randomBytes(numBytes);
    } catch (e) {
      // XXX should re-throw any error except insufficient entropy
      bytes = nodeCrypto.pseudoRandomBytes(numBytes);
    }
    var result = bytes.toString("hex");
    // If the number of digits is odd, we'll have generated an extra 4 bits
    // of randomness, so we need to trim the last digit.
    return result.substring(0, digits);
  } else {
    return this._randomString(digits, "0123456789abcdef");
  }
};

RandomGenerator.prototype._randomString = function (charsCount,
                                                    alphabet) {
  var self = this;
  var digits = [];
  for (var i = 0; i < charsCount; i++) {
    digits[i] = self.choice(alphabet);
  }
  return digits.join("");
};

RandomGenerator.prototype.id = function (charsCount) {
  var self = this;
  // 17 characters is around 96 bits of entropy, which is the amount of
  // state in the Alea PRNG.
  if (charsCount === undefined)
    charsCount = 17;

  return self._randomString(charsCount, UNMISTAKABLE_CHARS);
};

RandomGenerator.prototype.secret = function (charsCount) {
  var self = this;
  // Default to 256 bits of entropy, or 43 characters at 6 bits per
  // character.
  if (charsCount === undefined)
    charsCount = 43;
  return self._randomString(charsCount, BASE64_CHARS);
};

RandomGenerator.prototype.choice = function (arrayOrString) {
  var index = Math.floor(this.fraction() * arrayOrString.length);
  if (typeof arrayOrString === "string")
    return arrayOrString.substr(index, 1);
  else
    return arrayOrString[index];
};

// instantiate RNG.  Heuristically collect entropy from various sources when a
// cryptographic PRNG isn't available.

// client sources
var height = (typeof window !== 'undefined' && window.innerHeight) ||
      (typeof document !== 'undefined'
       && document.documentElement
       && document.documentElement.clientHeight) ||
      (typeof document !== 'undefined'
       && document.body
       && document.body.clientHeight) ||
      1;

var width = (typeof window !== 'undefined' && window.innerWidth) ||
      (typeof document !== 'undefined'
       && document.documentElement
       && document.documentElement.clientWidth) ||
      (typeof document !== 'undefined'
       && document.body
       && document.body.clientWidth) ||
      1;

var agent = (typeof navigator !== 'undefined' && navigator.userAgent) || "";

function createAleaGeneratorWithGeneratedSeed() {
  return new RandomGenerator(
    RandomGenerator.Type.ALEA,
    {seeds: [new Date, height, width, agent, Math.random()]});
};

if (Meteor.isServer) {
  Random = new RandomGenerator(RandomGenerator.Type.NODE_CRYPTO);
} else {
  if (typeof window !== "undefined" && window.crypto &&
      window.crypto.getRandomValues) {
    Random = new RandomGenerator(RandomGenerator.Type.BROWSER_CRYPTO);
  } else {
    // On IE 10 and below, there's no browser crypto API
    // available. Fall back to Alea
    //
    // XXX looks like at the moment, we use Alea in IE 11 as well,
    // which has `window.msCrypto` instead of `window.crypto`.
    Random = createAleaGeneratorWithGeneratedSeed();
  }
}

// Create a non-cryptographically secure PRNG with a given seed (using
// the Alea algorithm)
Random.createWithSeeds = function (...seeds) {
  if (seeds.length === 0) {
    throw new Error("No seeds were provided");
  }
  return new RandomGenerator(RandomGenerator.Type.ALEA, {seeds: seeds});
};

// Used like `Random`, but much faster and not cryptographically
// secure
Random.insecure = createAleaGeneratorWithGeneratedSeed();
