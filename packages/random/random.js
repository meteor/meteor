// We use cryptographically strong PRNGs (crypto.getRandomBytes() on the server,
// window.crypto.getRandomValues() in the browser) when available. If these
// PRNGs fail, we fall back to the Alea PRNG, which is not cryptographically
// strong, and we seed it with various sources such as the date, Math.random,
// and window size on the client.  When using crypto.getRandomValues(), our
// primitive is hexString(), from which we construct fraction(). When using
// window.crypto.getRandomValues() or alea, the primitive is fraction and we use
// that to construct hex string.

import { Meteor } from 'meteor/meteor';

let nodeCrypto;
if (Meteor.isServer) {
  import crypto from 'crypto';
  nodeCrypto = crypto;
}

// see http://baagoe.org/en/wiki/Better_random_numbers_for_javascript
// for a full discussion and Alea implementation.
const Alea = (seeds) => {
  function Mash() {
    let n = 0xefc8249d;

    const mash = (data) => {
      data = data.toString();
      for (let i = 0; i < data.length; i++) {
        n += data.charCodeAt(i);
        let h = 0.02519603282416938 * n;
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

  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let c = 1;
  if (seeds.length === 0) {
    seeds = [+new Date];
  }
  let mash = Mash();
  s0 = mash(' ');
  s1 = mash(' ');
  s2 = mash(' ');

  for (let i = 0; i < seeds.length; i++) {
    s0 -= mash(seeds[i]);
    if (s0 < 0) {
      s0 += 1;
    }
    s1 -= mash(seeds[i]);
    if (s1 < 0) {
      s1 += 1;
    }
    s2 -= mash(seeds[i]);
    if (s2 < 0) {
      s2 += 1;
    }
  }
  mash = null;

  const random = () => {
    const t = (2091639 * s0) + (c * 2.3283064365386963e-10); // 2^-32
    s0 = s1;
    s1 = s2;
    return s2 = t - (c = t | 0);
  };

  random.uint32 = () => random() * 0x100000000; // 2^32
  random.fract53 = () => random() +
        ((random() * 0x200000 | 0) * 1.1102230246251565e-16); // 2^-53

  random.version = 'Alea 0.9';
  random.args = seeds;
  return random;
};

const UNMISTAKABLE_CHARS = '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz';
const BASE64_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  '0123456789-_';

// `type` is one of `RandomGenerator.Type` as defined below.
//
// options:
// - seeds: (required, only for RandomGenerator.Type.ALEA) an array
//   whose items will be `toString`ed and used as the seed to the Alea
//   algorithm
class RandomGenerator {
  constructor (type, { seeds = [] } = {}) {
    this.type = type;

    if (!RandomGenerator.Type[type]) {
      throw new Error(`Unknown random generator type: ${type}`);
    }

    if (type === RandomGenerator.Type.ALEA) {
      if (!seeds) {
        throw new Error('No seeds were provided for Alea PRNG');
      }
      this.alea = Alea(seeds);
    }
  }

  /**
   * @name Random.fraction
   * @summary Return a number between 0 and 1, like `Math.random`.
   * @locus Anywhere
   */
  fraction () {
    switch (this.type) {
    case RandomGenerator.Type.ALEA:
      return this.alea();
    case RandomGenerator.Type.NODE_CRYPTO: {
      const numerator = Number.parseInt(this.hexString(8), 16);
      return numerator * 2.3283064365386963e-10; // 2^-32
    }
    case RandomGenerator.Type.BROWSER_CRYPTO: {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return array[0] * 2.3283064365386963e-10; // 2^-32
    }
    default:
      throw new Error(`Unknown random generator type: ${this.type}`);
    }
  }

  /**
   * @name Random.hexString
   * @summary Return a random string of `n` hexadecimal digits.
   * @locus Anywhere
   * @param {Number} n Length of the string
   */
  hexString (digits) {
    if (this.type === RandomGenerator.Type.NODE_CRYPTO) {
      const numBytes = Math.ceil(digits / 2);
      let bytes;
      // Try to get cryptographically strong randomness. Fall back to
      // non-cryptographically strong if not available.
      try {
        bytes = nodeCrypto.randomBytes(numBytes);
      } catch (e) {
        // XXX should re-throw any error except insufficient entropy
        bytes = nodeCrypto.pseudoRandomBytes(numBytes);
      }
      const result = bytes.toString('hex');
      // If the number of digits is odd, we'll have generated an extra 4 bits
      // of randomness, so we need to trim the last digit.
      return result.substring(0, digits);
    } else {
      return this._randomString(digits, '0123456789abcdef');
    }
  }

  _randomString (charsCount, alphabet) {
    return [...Array(charsCount)].map(this.choice.bind(this, alphabet)).join('');
  }

  /**
   * @name Random.id
   * @summary Return a unique identifier, such as `"Jjwjg6gouWLXhMGKW"`, that is
   * likely to be unique in the whole world.
   * @locus Anywhere
   * @param {Number} [n] Optional length of the identifier in characters
   *   (defaults to 17)
   */
  id (charsCount) {
    // 17 characters is around 96 bits of entropy, which is the amount of
    // state in the Alea PRNG.
    if (charsCount === undefined) {
      charsCount = 17;
    }

    return this._randomString(charsCount, UNMISTAKABLE_CHARS);
  }

  /**
   * @name Random.secret
   * @summary Return a random string of printable characters with 6 bits of
   * entropy per character. Use `Random.secret` for security-critical secrets
   * that are intended for machine, rather than human, consumption.
   * @locus Anywhere
   * @param {Number} [n] Optional length of the secret string (defaults to 43
   *   characters, or 256 bits of entropy)
   */
  secret (charsCount) {
    // Default to 256 bits of entropy, or 43 characters at 6 bits per
    // character.
    if (charsCount === undefined) {
      charsCount = 43;
    }

    return this._randomString(charsCount, BASE64_CHARS);
  }

  /**
   * @name Random.choice
   * @summary Return a random element of the given array or string.
   * @locus Anywhere
   * @param {Array|String} arrayOrString Array or string to choose from
   */
  choice (arrayOrString) {
    const index = Math.floor(this.fraction() * arrayOrString.length);
    if (typeof arrayOrString === 'string') {
      return arrayOrString.substr(index, 1);
    }
    return arrayOrString[index];
  }
}

// Types of PRNGs supported by the `RandomGenerator` class
RandomGenerator.Type = {
  // Use Node's built-in `crypto.getRandomBytes` (cryptographically
  // secure but not seedable, runs only on the server). Reverts to
  // `crypto.getPseudoRandomBytes` in the extremely uncommon case that
  // there isn't enough entropy yet
  NODE_CRYPTO: 'NODE_CRYPTO',

  // Use non-IE browser's built-in `window.crypto.getRandomValues`
  // (cryptographically secure but not seedable, runs only in the
  // browser).
  BROWSER_CRYPTO: 'BROWSER_CRYPTO',

  // Use the *fast*, seedaable and not cryptographically secure
  // Alea algorithm
  ALEA: 'ALEA',
};

// instantiate RNG.  Heuristically collect entropy from various sources when a
// cryptographic PRNG isn't available.

// client sources
const height = (typeof window !== 'undefined' && window.innerHeight) ||
      (typeof document !== 'undefined'
       && document.documentElement
       && document.documentElement.clientHeight) ||
      (typeof document !== 'undefined'
       && document.body
       && document.body.clientHeight) ||
      1;

const width = (typeof window !== 'undefined' && window.innerWidth) ||
      (typeof document !== 'undefined'
       && document.documentElement
       && document.documentElement.clientWidth) ||
      (typeof document !== 'undefined'
       && document.body
       && document.body.clientWidth) ||
      1;

const agent = (typeof navigator !== 'undefined' && navigator.userAgent) || '';

function createAleaGeneratorWithGeneratedSeed() {
  return new RandomGenerator(
    RandomGenerator.Type.ALEA,
    { seeds: [new Date, height, width, agent, Math.random()] },
  );
}

let Random;
if (Meteor.isServer) {
  Random = new RandomGenerator(RandomGenerator.Type.NODE_CRYPTO);
} else if (typeof window !== 'undefined' && window.crypto &&
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

// Create a non-cryptographically secure PRNG with a given seed (using
// the Alea algorithm)
Random.createWithSeeds = (...seeds) => {
  if (seeds.length === 0) {
    throw new Error('No seeds were provided');
  }
  return new RandomGenerator(RandomGenerator.Type.ALEA, { seeds });
};

// Used like `Random`, but much faster and not cryptographically
// secure
Random.insecure = createAleaGeneratorWithGeneratedSeed();

export { Random };
