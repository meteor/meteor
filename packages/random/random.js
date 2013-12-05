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

// If seeds are provided, then the alea PRNG will be used, since cryptographic
// PRNGs (Node crypto and window.crypto.getRandomValues) don't allow us to
// specify seeds. The caller is responsible for making sure to provide a seed
// for alea if a csprng is not available.
var RandomGenerator = function (seedArray) {
  var self = this;
  if (seedArray !== undefined)
    self.alea = Alea.apply(null, seedArray);
};

RandomGenerator.prototype.fraction = function () {
  var self = this;
  if (self.alea) {
    return self.alea();
  } else if (nodeCrypto) {
    var numerator = parseInt(self.hexString(8), 16);
    return numerator * 2.3283064365386963e-10; // 2^-32
  } else if (typeof window !== "undefined" && window.crypto &&
             window.crypto.getRandomValues) {
    var array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] * 2.3283064365386963e-10; // 2^-32
  }
};

RandomGenerator.prototype.hexString = function (digits) {
  var self = this;
  if (nodeCrypto && ! self.alea) {
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
    var hexDigits = [];
    for (var i = 0; i < digits; ++i) {
      hexDigits.push(self.choice("0123456789abcdef"));
    }
    return hexDigits.join('');
  }
};
RandomGenerator.prototype.id = function () {
  var digits = [];
  var self = this;
  // Length of 17 preserves around 96 bits of entropy, which is the
  // amount of state in the Alea PRNG.
  for (var i = 0; i < 17; i++) {
    digits[i] = self.choice(UNMISTAKABLE_CHARS);
  }
  return digits.join("");
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

if (nodeCrypto ||
    (typeof window !== "undefined" &&
     window.crypto && window.crypto.getRandomValues))
  Random = new RandomGenerator();
else
  Random = new RandomGenerator([new Date(), height, width, agent, Math.random()]);

Random.create = function () {
  return new RandomGenerator(arguments);
};
