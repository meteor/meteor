/* eslint-disable no-bitwise, no-plusplus, no-var */

// We use cryptographically strong PRNGs (crypto.getRandomBytes() on the server,
// window.crypto.getRandomValues() in the browser) when available. If these
// PRNGs fail, we fall back to the Alea PRNG, which is not cryptographically
// strong, and we seed it with various sources such as the date, Math.random,
// and window size on the client.  When using crypto.getRandomValues(), our
// primitive is hexString(), from which we construct fraction(). When using
// window.crypto.getRandomValues() or alea, the primitive is fraction and we use
// that to construct hex string.

/**
 * @name Mash
 * @method
 * @summary see http://baagoe.org/en/wiki/Better_random_numbers_for_javascript for a full discussion and Alea implementation.
 * @returns {Function} A mash function
 */
function Mash() {
  var num = 0xefc8249d;

  /**
   * @name mash
   * @method
   * @param {String} data Data
   * @returns {Function} A mash function
   */
  function mash(data) {
    const dataString = data.toString();
    for (let index = 0; index < dataString.length; index++) {
      num += dataString.charCodeAt(index);
      let hNum = 0.02519603282416938 * num;
      num = hNum >>> 0;
      hNum -= num;
      hNum *= num;
      num = hNum >>> 0;
      hNum -= num;
      num += hNum * 0x100000000; // 2^32
    }
    return (num >>> 0) * 2.3283064365386963e-10; // 2^-32
  }

  mash.version = "Mash 0.9";
  return mash;
}

/**
 * @name Alea
 * @method
 * @summary see http://baagoe.org/en/wiki/Better_random_numbers_for_javascript for a full discussion and Alea implementation.
 * @param {Number[]} seedArray Seed array
 * @returns {Function} A random function
 */
export default function Alea(...inputArgs) {
  var s0 = 0;
  var s1 = 0;
  var s2 = 0;
  var cst = 1;

  const args = (inputArgs.length === 0) ? [+new Date()] : inputArgs;

  var mash = Mash();
  s0 = mash(" ");
  s1 = mash(" ");
  s2 = mash(" ");

  for (let index = 0; index < args.length; index++) {
    s0 -= mash(args[index]);
    if (s0 < 0) {
      s0 += 1;
    }
    s1 -= mash(args[index]);
    if (s1 < 0) {
      s1 += 1;
    }
    s2 -= mash(args[index]);
    if (s2 < 0) {
      s2 += 1;
    }
  }
  mash = null;

  /**
   * @name random
   * @method
   * @summary see http://baagoe.org/en/wiki/Better_random_numbers_for_javascript for a full discussion and Alea implementation.
   * @returns {Number} A random number
   */
  function random() {
    const val = 2091639 * s0 + cst * 2.3283064365386963e-10; // 2^-32
    s0 = s1;
    s1 = s2;
    cst = val | 0;
    s2 = val - cst;
    return s2;
  }

  random.uint32 = function () {
    return random() * 0x100000000; // 2^32
  };

  random.fract53 = function () {
    return random() + (random() * 0x200000 | 0) * 1.1102230246251565e-16; // 2^-53
  };

  random.version = "Alea 0.9";
  random.args = args;
  return random;
}
