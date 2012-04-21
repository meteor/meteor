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

var MARC4 = C.MARC4 = {

	/**
	 * Public API
	 */

	encrypt: function (message, password) {

		var

		    // Convert to bytes
		    m = UTF8.stringToBytes(message),

		    // Generate random IV
		    iv = util.randomBytes(16),

		    // Generate key
		    k = password.constructor == String ?
		        // Derive key from passphrase
		        C.PBKDF2(password, iv, 32, { asBytes: true }) :
		        // else, assume byte array representing cryptographic key
		        password;

		// Encrypt
		MARC4._marc4(m, k, 1536);

		// Return ciphertext
		return util.bytesToBase64(iv.concat(m));

	},

	decrypt: function (ciphertext, password) {

		var

		    // Convert to bytes
		    c = util.base64ToBytes(ciphertext),

		    // Separate IV and message
		    iv = c.splice(0, 16),

		    // Generate key
		    k = password.constructor == String ?
		        // Derive key from passphrase
		        C.PBKDF2(password, iv, 32, { asBytes: true }) :
		        // else, assume byte array representing cryptographic key
		        password;

		// Decrypt
		MARC4._marc4(c, k, 1536);

		// Return plaintext
		return UTF8.bytesToString(c);

	},


	/**
	 * Internal methods
	 */

	// The core
	_marc4: function (m, k, drop) {

		// State variables
		var i, j, s, temp;

		// Key setup
		for (i = 0, s = []; i < 256; i++) s[i] = i;
		for (i = 0, j = 0;  i < 256; i++) {

			j = (j + s[i] + k[i % k.length]) % 256;

			// Swap
			temp = s[i];
			s[i] = s[j];
			s[j] = temp;

		}

		// Clear counters
		i = j = 0;

		// Encryption
		for (var k = -drop; k < m.length; k++) {

			i = (i + 1) % 256;
			j = (j + s[i]) % 256;

			// Swap
			temp = s[i];
			s[i] = s[j];
			s[j] = temp;

			// Stop here if we're still dropping keystream
			if (k < 0) continue;

			// Encrypt
			m[k] ^= s[(s[i] + s[j]) % 256];

		}

	}

};

})();
