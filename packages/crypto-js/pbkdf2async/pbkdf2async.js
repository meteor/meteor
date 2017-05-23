/*
 * Crypto-JS v2.5.3
 * http://code.google.com/p/crypto-js/
 * (c) 2009-2012 by Jeff Mott. All rights reserved.
 * http://code.google.com/p/crypto-js/wiki/License
 */
(function(){

// Shortcuts
var C = Crypto,
    util = C.util,
    charenc = C.charenc,
    UTF8 = charenc.UTF8,
    Binary = charenc.Binary;

if (!C.nextTick) {
    // node.js has setTime out but prefer process.nextTick
    if (typeof process != 'undefined' && typeof process.nextTick !== 'undefined') {
        C.nextTick = process.nextTick;
    } else if (typeof setTimeout !== 'undefined') {
        C.nextTick = function (callback) {
            setTimeout(callback, 0);
        };
    }
}

C.PBKDF2Async = function (password, salt, keylen, callback, options) {

    // Convert to byte arrays
    if (password.constructor == String) password = UTF8.stringToBytes(password);
    if (salt.constructor == String) salt = UTF8.stringToBytes(salt);
    /* else, assume byte arrays already */

    // Defaults
    var hasher = options && options.hasher || C.SHA1,
        iterations = options && options.iterations || 1;

    // Progress callback option
    var progressChangeHandler = options && options.onProgressChange;
    var totalIterations = Math.ceil(keylen / hasher._digestsize) * iterations;
    function fireProgressChange(currentIteration) {
        if (progressChangeHandler) {
            var iterationsSoFar = derivedKeyBytes.length / hasher._digestsize * iterations + currentIteration;
            setTimeout(function () {
                progressChangeHandler(Math.round(iterationsSoFar / totalIterations * 100));
            }, 0);
        }
    }

    // Pseudo-random function
    function PRF(password, salt) {
        return C.HMAC(hasher, salt, password, { asBytes: true });
    }

    var nextTick = C.nextTick;

    // Generate key
    var derivedKeyBytes = [],
        blockindex = 1;

    var outer, inner;
    nextTick(outer = function () {
        if (derivedKeyBytes.length < keylen) {
            var block = PRF(password, salt.concat(util.wordsToBytes([blockindex])));
            fireProgressChange(1);

            var u = block, i = 1;
            nextTick(inner = function () {
                if (i < iterations) {
                    u = PRF(password, u);
                    for (var j = 0; j < block.length; j++) block[j] ^= u[j];
                    i++;
                    fireProgressChange(i);

                    nextTick(inner);
                } else {
                    derivedKeyBytes = derivedKeyBytes.concat(block);
                    blockindex++;
                    nextTick(outer);
                }
            });
        } else {
            // Truncate excess bytes
            derivedKeyBytes.length = keylen;
            callback(
                    options && options.asBytes ? derivedKeyBytes :
                    options && options.asString ? Binary.bytesToString(derivedKeyBytes) :
                    util.bytesToHex(derivedKeyBytes));
        }
    });
};

})();
