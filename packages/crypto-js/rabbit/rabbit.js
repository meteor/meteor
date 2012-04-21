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

// Inner state
var x = [],
    c = [],
    b;

var Rabbit = C.Rabbit = {

	/**
	 * Public API
	 */

	encrypt: function (message, password) {

		var

		    // Convert to bytes
		    m = UTF8.stringToBytes(message),

		    // Generate random IV
		    iv = util.randomBytes(8),

		    // Generate key
		    k = password.constructor == String ?
		        // Derive key from passphrase
		        C.PBKDF2(password, iv, 32, { asBytes: true }) :
		        // else, assume byte array representing cryptographic key
		        password;

		// Encrypt
		Rabbit._rabbit(m, k, util.bytesToWords(iv));

		// Return ciphertext
		return util.bytesToBase64(iv.concat(m));

	},

	decrypt: function (ciphertext, password) {

		var

		    // Convert to bytes
		    c = util.base64ToBytes(ciphertext),

		    // Separate IV and message
		    iv = c.splice(0, 8),

		    // Generate key
		    k = password.constructor == String ?
		        // Derive key from passphrase
		        C.PBKDF2(password, iv, 32, { asBytes: true }) :
		        // else, assume byte array representing cryptographic key
		        password;

		// Decrypt
		Rabbit._rabbit(c, k, util.bytesToWords(iv));

		// Return plaintext
		return UTF8.bytesToString(c);

	},


	/**
	 * Internal methods
	 */

	// Encryption/decryption scheme
	_rabbit: function (m, k, iv) {

		Rabbit._keysetup(k);
		if (iv) Rabbit._ivsetup(iv);

		for (var s = [], i = 0; i < m.length; i++) {

			if (i % 16 == 0) {

				// Iterate the system
				Rabbit._nextstate();

				// Generate 16 bytes of pseudo-random data
				s[0] = x[0] ^ (x[5] >>> 16) ^ (x[3] << 16);
				s[1] = x[2] ^ (x[7] >>> 16) ^ (x[5] << 16);
				s[2] = x[4] ^ (x[1] >>> 16) ^ (x[7] << 16);
				s[3] = x[6] ^ (x[3] >>> 16) ^ (x[1] << 16);

				// Swap endian
				for (var j = 0; j < 4; j++) {
					s[j] = ((s[j] <<  8) | (s[j] >>> 24)) & 0x00FF00FF |
					       ((s[j] << 24) | (s[j] >>>  8)) & 0xFF00FF00;
				}

				// Convert words to bytes
				for (var b = 120; b >= 0; b -= 8)
					s[b / 8] = (s[b >>> 5] >>> (24 - b % 32)) & 0xFF;

			}

			m[i] ^= s[i % 16];

		}

	},

	// Key setup scheme
	_keysetup: function (k) {

		// Generate initial state values
		x[0] = k[0];
		x[2] = k[1];
		x[4] = k[2];
		x[6] = k[3];
		x[1] = (k[3] << 16) | (k[2] >>> 16);
		x[3] = (k[0] << 16) | (k[3] >>> 16);
		x[5] = (k[1] << 16) | (k[0] >>> 16);
		x[7] = (k[2] << 16) | (k[1] >>> 16);

		// Generate initial counter values
		c[0] = util.rotl(k[2], 16);
		c[2] = util.rotl(k[3], 16);
		c[4] = util.rotl(k[0], 16);
		c[6] = util.rotl(k[1], 16);
		c[1] = (k[0] & 0xFFFF0000) | (k[1] & 0xFFFF);
		c[3] = (k[1] & 0xFFFF0000) | (k[2] & 0xFFFF);
		c[5] = (k[2] & 0xFFFF0000) | (k[3] & 0xFFFF);
		c[7] = (k[3] & 0xFFFF0000) | (k[0] & 0xFFFF);

		// Clear carry bit
		b = 0;

		// Iterate the system four times
		for (var i = 0; i < 4; i++) Rabbit._nextstate();

		// Modify the counters
		for (var i = 0; i < 8; i++) c[i] ^= x[(i + 4) & 7];

	},

	// IV setup scheme
	_ivsetup: function (iv) {

		// Generate four subvectors
		var i0 = util.endian(iv[0]),
		    i2 = util.endian(iv[1]),
		    i1 = (i0 >>> 16) | (i2 & 0xFFFF0000),
		    i3 = (i2 <<  16) | (i0 & 0x0000FFFF);

		// Modify counter values
		c[0] ^= i0;
		c[1] ^= i1;
		c[2] ^= i2;
		c[3] ^= i3;
		c[4] ^= i0;
		c[5] ^= i1;
		c[6] ^= i2;
		c[7] ^= i3;

		// Iterate the system four times
		for (var i = 0; i < 4; i++) Rabbit._nextstate();

	},

	// Next-state function
	_nextstate: function () {

		// Save old counter values
		for (var c_old = [], i = 0; i < 8; i++) c_old[i] = c[i];

		// Calculate new counter values
		c[0] = (c[0] + 0x4D34D34D + b) >>> 0;
		c[1] = (c[1] + 0xD34D34D3 + ((c[0] >>> 0) < (c_old[0] >>> 0) ? 1 : 0)) >>> 0;
		c[2] = (c[2] + 0x34D34D34 + ((c[1] >>> 0) < (c_old[1] >>> 0) ? 1 : 0)) >>> 0;
		c[3] = (c[3] + 0x4D34D34D + ((c[2] >>> 0) < (c_old[2] >>> 0) ? 1 : 0)) >>> 0;
		c[4] = (c[4] + 0xD34D34D3 + ((c[3] >>> 0) < (c_old[3] >>> 0) ? 1 : 0)) >>> 0;
		c[5] = (c[5] + 0x34D34D34 + ((c[4] >>> 0) < (c_old[4] >>> 0) ? 1 : 0)) >>> 0;
		c[6] = (c[6] + 0x4D34D34D + ((c[5] >>> 0) < (c_old[5] >>> 0) ? 1 : 0)) >>> 0;
		c[7] = (c[7] + 0xD34D34D3 + ((c[6] >>> 0) < (c_old[6] >>> 0) ? 1 : 0)) >>> 0;
		b = (c[7] >>> 0) < (c_old[7] >>> 0) ? 1 : 0;

		// Calculate the g-values
		for (var g = [], i = 0; i < 8; i++) {

			var gx = (x[i] + c[i]) >>> 0;

			// Construct high and low argument for squaring
			var ga = gx & 0xFFFF,
			    gb = gx >>> 16;

			// Calculate high and low result of squaring
			var gh = ((((ga * ga) >>> 17) + ga * gb) >>> 15) + gb * gb,
			    gl = (((gx & 0xFFFF0000) * gx) >>> 0) + (((gx & 0x0000FFFF) * gx) >>> 0) >>> 0;

			// High XOR low
			g[i] = gh ^ gl;

		}

		// Calculate new state values
		x[0] = g[0] + ((g[7] << 16) | (g[7] >>> 16)) + ((g[6] << 16) | (g[6] >>> 16));
		x[1] = g[1] + ((g[0] <<  8) | (g[0] >>> 24)) + g[7];
		x[2] = g[2] + ((g[1] << 16) | (g[1] >>> 16)) + ((g[0] << 16) | (g[0] >>> 16));
		x[3] = g[3] + ((g[2] <<  8) | (g[2] >>> 24)) + g[1];
		x[4] = g[4] + ((g[3] << 16) | (g[3] >>> 16)) + ((g[2] << 16) | (g[2] >>> 16));
		x[5] = g[5] + ((g[4] <<  8) | (g[4] >>> 24)) + g[3];
		x[6] = g[6] + ((g[5] << 16) | (g[5] >>> 16)) + ((g[4] << 16) | (g[4] >>> 16));
		x[7] = g[7] + ((g[6] <<  8) | (g[6] >>> 24)) + g[5];

	}

};

})();
