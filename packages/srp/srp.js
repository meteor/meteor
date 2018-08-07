// This package contains just enough of the original SRP code to
// support the backwards-compatibility upgrade path.
//
// An SRP (and possibly also accounts-srp) package should eventually be
// available in Atmosphere so that users can continue to use SRP if they
// want to.

SRP = {};

/**
 * Generate a new SRP verifier. Password is the plaintext password.
 *
 * options is optional and can include:
 * - identity: String. The SRP username to user. Mostly this is passed
 *   in for testing.  Random UUID if not provided.
 * - hashedIdentityAndPassword: combined identity and password, already hashed, for the SRP to bcrypt upgrade path.
 * - salt: String. A salt to use.  Mostly this is passed in for
 *   testing.  Random UUID if not provided.
 * - SRP parameters (see _defaults and paramsFromOptions below)
 */
SRP.generateVerifier = function (password, options) {
  var params = paramsFromOptions(options);

  var salt = (options && options.salt) || Random.secret();

  var identity;
  var hashedIdentityAndPassword = options && options.hashedIdentityAndPassword;
  if (!hashedIdentityAndPassword) {
    identity = (options && options.identity) || Random.secret();
    hashedIdentityAndPassword = params.hash(identity + ":" + password);
  }

  var x = params.hash(salt + hashedIdentityAndPassword);
  var xi = new BigInteger(x, 16);
  var v = params.g.modPow(xi, params.N);

  return {
    identity: identity,
    salt: salt,
    verifier: v.toString(16)
  };
};

// For use with check().
SRP.matchVerifier = {
  identity: String,
  salt: String,
  verifier: String
};


/**
 * Default parameter values for SRP.
 *
 */
var _defaults = {
  hash: function (x) { return SHA256(x).toLowerCase(); },
  N: new BigInteger("EEAF0AB9ADB38DD69C33F80AFA8FC5E86072618775FF3C0B9EA2314C9C256576D674DF7496EA81D3383B4813D692C6E0E0D5D8E250B98BE48E495C1D6089DAD15DC7D7B46154D6B6CE8EF4AD69B15D4982559B297BCF1885C529F566660E57EC68EDBC3C05726CC02FD4CBF4976EAA9AFD5138FE8376435B9FC61D2FC0EB06E3", 16),
  g: new BigInteger("2")
};
_defaults.k = new BigInteger(
  _defaults.hash(
    _defaults.N.toString(16) +
      _defaults.g.toString(16)),
  16);

/**
 * Process an options hash to create SRP parameters.
 *
 * Options can include:
 * - hash: Function. Defaults to SHA256.
 * - N: String or BigInteger. Defaults to 1024 bit value from RFC 5054
 * - g: String or BigInteger. Defaults to 2.
 * - k: String or BigInteger. Defaults to hash(N, g)
 */
var paramsFromOptions = function (options) {
  if (!options) // fast path
    return _defaults;

  var ret = { ..._defaults };

  ['N', 'g', 'k'].forEach(function (p) {
    if (options[p]) {
      if (typeof options[p] === "string")
        ret[p] = new BigInteger(options[p], 16);
      else if (options[p] instanceof BigInteger)
        ret[p] = options[p];
      else
        throw new Error("Invalid parameter: " + p);
    }
  });

  if (options.hash)
    ret.hash = function (x) { return options.hash(x).toLowerCase(); };

  if (!options.k && (options.N || options.g || options.hash)) {
    ret.k = ret.hash(ret.N.toString(16) + ret.g.toString(16));
  }

  return ret;
};
