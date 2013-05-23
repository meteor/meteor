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

var create = function (/* arguments */) {

  var random = Alea.apply(null, arguments);

  var self = {};

  var bind = function (fn) {
    return _.bind(fn, self);
  };

  return _.extend(self, {
    _Alea: Alea,

    create: create,

    fraction: random,

    choice: bind(function (arrayOrString) {
      var index = Math.floor(this.fraction() * arrayOrString.length);
      if (typeof arrayOrString === "string")
        return arrayOrString.substr(index, 1);
      else
        return arrayOrString[index];
    }),

    id: bind(function() {
      var digits = [];
      // Length of 17 preserves around 96 bits of entropy, which is the
      // amount of state in our PRNG
      for (var i = 0; i < 17; i++) {
        digits[i] = this.choice(UNMISTAKABLE_CHARS);
      }
      return digits.join("");
    }),

    hexString: bind(function (digits) {
      var hexDigits = [];
      for (var i = 0; i < digits; ++i) {
        hexDigits.push(this.choice("0123456789abcdef"));
      }
      return hexDigits.join('');
    })
  });
};

// instantiate RNG.  Heuristically collect entropy from various sources

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

// server sources
var pid = (typeof process !== 'undefined' && process.pid) || 1;

// XXX On the server, use the crypto module (OpenSSL) instead of this PRNG.
//     (Make Random.fraction be generated from Random.hexString instead of the
//     other way around, and generate Random.hexString from crypto.randomBytes.)
Random = create([
  new Date(), height, width, agent, pid, Math.random()
]);
