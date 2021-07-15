/* eslint-disable no-bitwise, no-plusplus, no-var, id-length */
import Alea from "./Alea";

const UNMISTAKABLE_CHARS = "23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz";
const BASE64_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

export default class RandomGenerator {
  // If seeds are provided, then the alea PRNG will be used, since cryptographic
  // PRNGs (Node crypto and window.crypto.getRandomValues) don't allow us to
  // specify seeds. The caller is responsible for making sure to provide a seed
  // for alea if a csprng is not available.
  constructor({ getRandomValues, nodeCrypto, seeds } = {}) {
    if (Array.isArray(seeds)) this.alea = Alea(seeds);
    this.getRandomValues = getRandomValues;
    this.nodeCrypto = nodeCrypto;
  }

  fraction() {
    if (this.alea) return this.alea();

    if (this.nodeCrypto) {
      const numerator = parseInt(this.hexString(8), 16);
      return numerator * 2.3283064365386963e-10; // 2^-32
    }

    if (this.getRandomValues) {
      const array = new Uint32Array(1);
      this.getRandomValues(array);
      return array[0] * 2.3283064365386963e-10; // 2^-32
    }

    throw new Error("No random generator available");
  }

  hexString(digits) {
    if (this.nodeCrypto && !this.alea) {
      const numBytes = Math.ceil(digits / 2);

      // Try to get cryptographically strong randomness. Fall back to
      // non-cryptographically strong if not available.
      let bytes;
      try {
        bytes = this.nodeCrypto.randomBytes(numBytes);
      } catch (e) {
        // XXX should re-throw any error except insufficient entropy
        bytes = this.nodeCrypto.pseudoRandomBytes(numBytes);
      }

      const result = bytes.toString("hex");

      // If the number of digits is odd, we'll have generated an extra 4 bits
      // of randomness, so we need to trim the last digit.
      return result.substring(0, digits);
    }

    const hexDigits = [];
    for (let i = 0; i < digits; ++i) { // eslint-disable-line no-plusplus
      hexDigits.push(this.choice("0123456789abcdef"));
    }
    return hexDigits.join("");
  }

  _randomString(charsCount, alphabet) {
    const digits = [];
    for (let i = 0; i < charsCount; i++) { // eslint-disable-line no-plusplus
      digits[i] = this.choice(alphabet);
    }
    return digits.join("");
  }

  id(charsCount = 17) {
    // 17 characters is around 96 bits of entropy, which is the amount of
    // state in the Alea PRNG.
    return this._randomString(charsCount, UNMISTAKABLE_CHARS);
  }

  secret(charsCount = 43) {
    // Default to 256 bits of entropy, or 43 characters at 6 bits per
    // character.
    return this._randomString(charsCount, BASE64_CHARS);
  }

  choice(arrayOrString) {
    const index = Math.floor(this.fraction() * arrayOrString.length);
    if (typeof arrayOrString === "string") return arrayOrString.substr(index, 1);
    return arrayOrString[index];
  }
}
