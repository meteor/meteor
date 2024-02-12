export const binary = {}

/**
 * @summary Allocate a new buffer of binary data that EJSON can serialize.
 * @locus Anywhere
 * @param {Number} size The number of bytes of binary data to allocate.
 */
binary.newBinary = len => {
    if (typeof Uint8Array === 'undefined' || typeof ArrayBuffer === 'undefined') {
      const ret = [];
      for (let i = 0; i < len; i++) {
        ret.push(0);
      }
  
      ret.$Uint8ArrayPolyfill = true;
      return ret;
    }
    return new Uint8Array(new ArrayBuffer(len));
  };

  /**
 * @summary Returns true if `x` is a buffer of binary data, as returned from
 *          [`newbinary`].
 * @param {Object} x The variable to check.
 * @locus Anywhere
 */
  binary.isBinary = obj => {
  return !!((typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array) ||
    (obj && obj.$Uint8ArrayPolyfill));
};
