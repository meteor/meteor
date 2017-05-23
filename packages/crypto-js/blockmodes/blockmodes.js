/*
 * Crypto-JS v2.5.3
 * http://code.google.com/p/crypto-js/
 * (c) 2009-2012 by Jeff Mott. All rights reserved.
 * http://code.google.com/p/crypto-js/wiki/License
 */
/*!
 * Crypto-JS contribution from Simon Greatrix
 */

(function(C){

// Create pad namespace
var C_pad = C.pad = {};

// Calculate the number of padding bytes required.
function _requiredPadding(cipher, message) {
    var blockSizeInBytes = cipher._blocksize * 4;
    var reqd = blockSizeInBytes - message.length % blockSizeInBytes;
    return reqd;
};

// Remove padding when the final byte gives the number of padding bytes.
var _unpadLength = function (message) {
        var pad = message.pop();
        for (var i = 1; i < pad; i++) {
            message.pop();
        }
    };

// No-operation padding, used for stream ciphers
C_pad.NoPadding = {
        pad : function (cipher,message) {},
        unpad : function (message) {}
    };

// Zero Padding.
//
// If the message is not an exact number of blocks, the final block is
// completed with 0x00 bytes. There is no unpadding.
C_pad.ZeroPadding = {
    pad : function (cipher, message) {
        var blockSizeInBytes = cipher._blocksize * 4;
        var reqd = message.length % blockSizeInBytes;
        if( reqd!=0 ) {
            for(reqd = blockSizeInBytes - reqd; reqd>0; reqd--) {
                message.push(0x00);
            }
        }
    },

    unpad : function (message) {}
};

// ISO/IEC 7816-4 padding.
//
// Pads the plain text with an 0x80 byte followed by as many 0x00
// bytes are required to complete the block.
C_pad.iso7816 = {
    pad : function (cipher, message) {
        var reqd = _requiredPadding(cipher, message);
        message.push(0x80);
        for (; reqd > 1; reqd--) {
            message.push(0x00);
        }
    },

    unpad : function (message) {
        while (message.pop() != 0x80) {}
    }
};

// ANSI X.923 padding
//
// The final block is padded with zeros except for the last byte of the
// last block which contains the number of padding bytes.
C_pad.ansix923 = {
    pad : function (cipher, message) {
        var reqd = _requiredPadding(cipher, message);
        for (var i = 1; i < reqd; i++) {
            message.push(0x00);
        }
        message.push(reqd);
    },

    unpad : _unpadLength
};

// ISO 10126
//
// The final block is padded with random bytes except for the last
// byte of the last block which contains the number of padding bytes.
C_pad.iso10126 = {
    pad : function (cipher, message) {
        var reqd = _requiredPadding(cipher, message);
        for (var i = 1; i < reqd; i++) {
            message.push(Math.floor(Math.random() * 256));
        }
        message.push(reqd);
    },

    unpad : _unpadLength
};

// PKCS7 padding
//
// PKCS7 is described in RFC 5652. Padding is in whole bytes. The
// value of each added byte is the number of bytes that are added,
// i.e. N bytes, each of value N are added.
C_pad.pkcs7 = {
    pad : function (cipher, message) {
        var reqd = _requiredPadding(cipher, message);
        for (var i = 0; i < reqd; i++) {
            message.push(reqd);
        }
    },

    unpad : _unpadLength
};

// Create mode namespace
var C_mode = C.mode = {};

/**
 * Mode base "class".
 */
var Mode = C_mode.Mode = function (padding) {
    if (padding) {
        this._padding = padding;
    }
};

Mode.prototype = {
    encrypt: function (cipher, m, iv) {
        this._padding.pad(cipher, m);
        this._doEncrypt(cipher, m, iv);
    },

    decrypt: function (cipher, m, iv) {
        this._doDecrypt(cipher, m, iv);
        this._padding.unpad(m);
    },

    // Default padding
    _padding: C_pad.iso7816
};


/**
 * Electronic Code Book mode.
 * 
 * ECB applies the cipher directly against each block of the input.
 * 
 * ECB does not require an initialization vector.
 */
var ECB = C_mode.ECB = function () {
    // Call parent constructor
    Mode.apply(this, arguments);
};

// Inherit from Mode
var ECB_prototype = ECB.prototype = new Mode;

// Concrete steps for Mode template
ECB_prototype._doEncrypt = function (cipher, m, iv) {
    var blockSizeInBytes = cipher._blocksize * 4;
    // Encrypt each block
    for (var offset = 0; offset < m.length; offset += blockSizeInBytes) {
        cipher._encryptblock(m, offset);
    }
};
ECB_prototype._doDecrypt = function (cipher, c, iv) {
    var blockSizeInBytes = cipher._blocksize * 4;
    // Decrypt each block
    for (var offset = 0; offset < c.length; offset += blockSizeInBytes) {
        cipher._decryptblock(c, offset);
    }
};

// ECB never uses an IV
ECB_prototype.fixOptions = function (options) {
    options.iv = [];
};


/**
 * Cipher block chaining
 * 
 * The first block is XORed with the IV. Subsequent blocks are XOR with the
 * previous cipher output.
 */
var CBC = C_mode.CBC = function () {
    // Call parent constructor
    Mode.apply(this, arguments);
};

// Inherit from Mode
var CBC_prototype = CBC.prototype = new Mode;

// Concrete steps for Mode template
CBC_prototype._doEncrypt = function (cipher, m, iv) {
    var blockSizeInBytes = cipher._blocksize * 4;

    // Encrypt each block
    for (var offset = 0; offset < m.length; offset += blockSizeInBytes) {
        if (offset == 0) {
            // XOR first block using IV
            for (var i = 0; i < blockSizeInBytes; i++)
            m[i] ^= iv[i];
        } else {
            // XOR this block using previous crypted block
            for (var i = 0; i < blockSizeInBytes; i++)
            m[offset + i] ^= m[offset + i - blockSizeInBytes];
        }
        // Encrypt block
        cipher._encryptblock(m, offset);
    }
};
CBC_prototype._doDecrypt = function (cipher, c, iv) {
    var blockSizeInBytes = cipher._blocksize * 4;

    // At the start, the previously crypted block is the IV
    var prevCryptedBlock = iv;

    // Decrypt each block
    for (var offset = 0; offset < c.length; offset += blockSizeInBytes) {
        // Save this crypted block
        var thisCryptedBlock = c.slice(offset, offset + blockSizeInBytes);
        // Decrypt block
        cipher._decryptblock(c, offset);
        // XOR decrypted block using previous crypted block
        for (var i = 0; i < blockSizeInBytes; i++) {
            c[offset + i] ^= prevCryptedBlock[i];
        }
        prevCryptedBlock = thisCryptedBlock;
    }
};


/**
 * Cipher feed back
 * 
 * The cipher output is XORed with the plain text to produce the cipher output,
 * which is then fed back into the cipher to produce a bit pattern to XOR the
 * next block with.
 * 
 * This is a stream cipher mode and does not require padding.
 */
var CFB = C_mode.CFB = function () {
    // Call parent constructor
    Mode.apply(this, arguments);
};

// Inherit from Mode
var CFB_prototype = CFB.prototype = new Mode;

// Override padding
CFB_prototype._padding = C_pad.NoPadding;

// Concrete steps for Mode template
CFB_prototype._doEncrypt = function (cipher, m, iv) {
    var blockSizeInBytes = cipher._blocksize * 4,
        keystream = iv.slice(0);

    // Encrypt each byte
    for (var i = 0; i < m.length; i++) {

        var j = i % blockSizeInBytes;
        if (j == 0) cipher._encryptblock(keystream, 0);

        m[i] ^= keystream[j];
        keystream[j] = m[i];
    }
};
CFB_prototype._doDecrypt = function (cipher, c, iv) {
    var blockSizeInBytes = cipher._blocksize * 4,
        keystream = iv.slice(0);

    // Encrypt each byte
    for (var i = 0; i < c.length; i++) {

        var j = i % blockSizeInBytes;
        if (j == 0) cipher._encryptblock(keystream, 0);

        var b = c[i];
        c[i] ^= keystream[j];
        keystream[j] = b;
    }
};


/**
 * Output feed back
 * 
 * The cipher repeatedly encrypts its own output. The output is XORed with the
 * plain text to produce the cipher text.
 * 
 * This is a stream cipher mode and does not require padding.
 */
var OFB = C_mode.OFB = function () {
    // Call parent constructor
    Mode.apply(this, arguments);
};

// Inherit from Mode
var OFB_prototype = OFB.prototype = new Mode;

// Override padding
OFB_prototype._padding = C_pad.NoPadding;

// Concrete steps for Mode template
OFB_prototype._doEncrypt = function (cipher, m, iv) {

    var blockSizeInBytes = cipher._blocksize * 4,
        keystream = iv.slice(0);

    // Encrypt each byte
    for (var i = 0; i < m.length; i++) {

        // Generate keystream
        if (i % blockSizeInBytes == 0)
            cipher._encryptblock(keystream, 0);

        // Encrypt byte
        m[i] ^= keystream[i % blockSizeInBytes];

    }
};
OFB_prototype._doDecrypt = OFB_prototype._doEncrypt;

/**
 * Counter
 * @author Gergely Risko
 *
 * After every block the last 4 bytes of the IV is increased by one
 * with carry and that IV is used for the next block.
 *
 * This is a stream cipher mode and does not require padding.
 */
var CTR = C_mode.CTR = function () {
    // Call parent constructor
    Mode.apply(this, arguments);
};

// Inherit from Mode
var CTR_prototype = CTR.prototype = new Mode;

// Override padding
CTR_prototype._padding = C_pad.NoPadding;

CTR_prototype._doEncrypt = function (cipher, m, iv) {
    var blockSizeInBytes = cipher._blocksize * 4;
    var counter = iv.slice(0);

    for (var i = 0; i < m.length;) {
        // do not lose iv
        var keystream = counter.slice(0);

        // Generate keystream for next block
        cipher._encryptblock(keystream, 0);

        // XOR keystream with block
        for (var j = 0; i < m.length && j < blockSizeInBytes; j++, i++) {
            m[i] ^= keystream[j];
        }

        // Increase counter
        if(++(counter[blockSizeInBytes-1]) == 256) {
            counter[blockSizeInBytes-1] = 0;
            if(++(counter[blockSizeInBytes-2]) == 256) {
                counter[blockSizeInBytes-2] = 0;
                if(++(counter[blockSizeInBytes-3]) == 256) {
                    counter[blockSizeInBytes-3] = 0;
                    ++(counter[blockSizeInBytes-4]);
                }
            }
        }
    }
};
CTR_prototype._doDecrypt = CTR_prototype._doEncrypt;

})(Crypto);
