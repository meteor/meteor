/*
 * Crypto-JS v2.5.3
 * http://code.google.com/p/crypto-js/
 * (c) 2009-2012 by Jeff Mott. All rights reserved.
 * http://code.google.com/p/crypto-js/wiki/License
 */
(function(){

// Shortcuts
var C = Crypto;
var util = C.util;
var charenc = C.charenc;
var UTF8 = C.charenc.UTF8;

// Precomputed SBOX
var SBOX = [ 0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5,
             0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
             0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0,
             0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
             0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc,
             0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
             0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a,
             0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
             0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0,
             0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
             0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b,
             0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
             0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85,
             0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
             0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5,
             0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
             0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17,
             0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
             0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88,
             0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
             0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c,
             0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
             0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9,
             0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
             0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6,
             0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
             0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e,
             0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
             0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94,
             0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
             0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68,
             0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16 ];

// Compute inverse SBOX lookup table
for (var INVSBOX = [], i = 0; i < 256; i++) INVSBOX[SBOX[i]] = i;

// Compute mulitplication in GF(2^8) lookup tables
var MULT2 = [],
    MULT3 = [],
    MULT9 = [],
    MULTB = [],
    MULTD = [],
    MULTE = [];

function xtime(a, b) {
	for (var result = 0, i = 0; i < 8; i++) {
		if (b & 1) result ^= a;
		var hiBitSet = a & 0x80;
		a = (a << 1) & 0xFF;
		if (hiBitSet) a ^= 0x1b;
		b >>>= 1;
	}
	return result;
}

for (var i = 0; i < 256; i++) {
	MULT2[i] = xtime(i,2);
	MULT3[i] = xtime(i,3);
	MULT9[i] = xtime(i,9);
	MULTB[i] = xtime(i,0xB);
	MULTD[i] = xtime(i,0xD);
	MULTE[i] = xtime(i,0xE);
}

// Precomputed RCon lookup
var RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

// Inner state
var state = [[], [], [], []],
    keylength,
    nrounds,
    keyschedule;

var AES = C.AES = {

	/**
	 * Public API
	 */

	encrypt: function (message, password, options) {

		options = options || {};

		// Determine mode
		var mode = options.mode || new C.mode.OFB;

		// Allow mode to override options
		if (mode.fixOptions) mode.fixOptions(options);

		var

			// Convert to bytes if message is a string
			m = (
				message.constructor == String ?
				UTF8.stringToBytes(message) :
				message
			),

			// Generate random IV
			iv = options.iv || util.randomBytes(AES._blocksize * 4),

			// Generate key
			k = (
				password.constructor == String ?
				// Derive key from passphrase
				C.PBKDF2(password, iv, 32, { asBytes: true }) :
				// else, assume byte array representing cryptographic key
				password
			);

		// Encrypt
		AES._init(k);
		mode.encrypt(AES, m, iv);

		// Return ciphertext
		m = options.iv ? m : iv.concat(m);
		return (options && options.asBytes) ? m : util.bytesToBase64(m);

	},

	decrypt: function (ciphertext, password, options) {

		options = options || {};

		// Determine mode
		var mode = options.mode || new C.mode.OFB;

		// Allow mode to override options
		if (mode.fixOptions) mode.fixOptions(options);

		var

			// Convert to bytes if ciphertext is a string
			c = (
				ciphertext.constructor == String ?
				util.base64ToBytes(ciphertext):
			    ciphertext
			),

			// Separate IV and message
			iv = options.iv || c.splice(0, AES._blocksize * 4),

			// Generate key
			k = (
				password.constructor == String ?
				// Derive key from passphrase
				C.PBKDF2(password, iv, 32, { asBytes: true }) :
				// else, assume byte array representing cryptographic key
				password
			);

		// Decrypt
		AES._init(k);
		mode.decrypt(AES, c, iv);

		// Return plaintext
		return (options && options.asBytes) ? c : UTF8.bytesToString(c);

	},


	/**
	 * Package private methods and properties
	 */

	_blocksize: 4,

	_encryptblock: function (m, offset) {

		// Set input
		for (var row = 0; row < AES._blocksize; row++) {
			for (var col = 0; col < 4; col++)
				state[row][col] = m[offset + col * 4 + row];
		}

		// Add round key
		for (var row = 0; row < 4; row++) {
			for (var col = 0; col < 4; col++)
				state[row][col] ^= keyschedule[col][row];
		}

		for (var round = 1; round < nrounds; round++) {

			// Sub bytes
			for (var row = 0; row < 4; row++) {
				for (var col = 0; col < 4; col++)
					state[row][col] = SBOX[state[row][col]];
			}

			// Shift rows
			state[1].push(state[1].shift());
			state[2].push(state[2].shift());
			state[2].push(state[2].shift());
			state[3].unshift(state[3].pop());

			// Mix columns
			for (var col = 0; col < 4; col++) {

				var s0 = state[0][col],
				    s1 = state[1][col],
				    s2 = state[2][col],
				    s3 = state[3][col];

				state[0][col] = MULT2[s0] ^ MULT3[s1] ^ s2 ^ s3;
				state[1][col] = s0 ^ MULT2[s1] ^ MULT3[s2] ^ s3;
				state[2][col] = s0 ^ s1 ^ MULT2[s2] ^ MULT3[s3];
				state[3][col] = MULT3[s0] ^ s1 ^ s2 ^ MULT2[s3];

			}

			// Add round key
			for (var row = 0; row < 4; row++) {
				for (var col = 0; col < 4; col++)
					state[row][col] ^= keyschedule[round * 4 + col][row];
			}

		}

		// Sub bytes
		for (var row = 0; row < 4; row++) {
			for (var col = 0; col < 4; col++)
				state[row][col] = SBOX[state[row][col]];
		}

		// Shift rows
		state[1].push(state[1].shift());
		state[2].push(state[2].shift());
		state[2].push(state[2].shift());
		state[3].unshift(state[3].pop());

		// Add round key
		for (var row = 0; row < 4; row++) {
			for (var col = 0; col < 4; col++)
				state[row][col] ^= keyschedule[nrounds * 4 + col][row];
		}

		// Set output
		for (var row = 0; row < AES._blocksize; row++) {
			for (var col = 0; col < 4; col++)
				m[offset + col * 4 + row] = state[row][col];
		}

	},

	_decryptblock: function (c, offset) {

		// Set input
		for (var row = 0; row < AES._blocksize; row++) {
			for (var col = 0; col < 4; col++)
				state[row][col] = c[offset + col * 4 + row];
		}

		// Add round key
		for (var row = 0; row < 4; row++) {
			for (var col = 0; col < 4; col++)
				state[row][col] ^= keyschedule[nrounds * 4 + col][row];
		}

		for (var round = 1; round < nrounds; round++) {

			// Inv shift rows
			state[1].unshift(state[1].pop());
			state[2].push(state[2].shift());
			state[2].push(state[2].shift());
			state[3].push(state[3].shift());

			// Inv sub bytes
			for (var row = 0; row < 4; row++) {
				for (var col = 0; col < 4; col++)
					state[row][col] = INVSBOX[state[row][col]];
			}

			// Add round key
			for (var row = 0; row < 4; row++) {
				for (var col = 0; col < 4; col++)
					state[row][col] ^= keyschedule[(nrounds - round) * 4 + col][row];
			}

			// Inv mix columns
			for (var col = 0; col < 4; col++) {

				var s0 = state[0][col],
				    s1 = state[1][col],
				    s2 = state[2][col],
				    s3 = state[3][col];

				state[0][col] = MULTE[s0] ^ MULTB[s1] ^ MULTD[s2] ^ MULT9[s3];
				state[1][col] = MULT9[s0] ^ MULTE[s1] ^ MULTB[s2] ^ MULTD[s3];
				state[2][col] = MULTD[s0] ^ MULT9[s1] ^ MULTE[s2] ^ MULTB[s3];
				state[3][col] = MULTB[s0] ^ MULTD[s1] ^ MULT9[s2] ^ MULTE[s3];

			}

		}

		// Inv shift rows
		state[1].unshift(state[1].pop());
		state[2].push(state[2].shift());
		state[2].push(state[2].shift());
		state[3].push(state[3].shift());

		// Inv sub bytes
		for (var row = 0; row < 4; row++) {
			for (var col = 0; col < 4; col++)
				state[row][col] = INVSBOX[state[row][col]];
		}

		// Add round key
		for (var row = 0; row < 4; row++) {
			for (var col = 0; col < 4; col++)
				state[row][col] ^= keyschedule[col][row];
		}

		// Set output
		for (var row = 0; row < AES._blocksize; row++) {
			for (var col = 0; col < 4; col++)
				c[offset + col * 4 + row] = state[row][col];
		}

	},


	/**
	 * Private methods
	 */

	_init: function (k) {
		keylength = k.length / 4;
		nrounds = keylength + 6;
		AES._keyexpansion(k);
	},

	// Generate a key schedule
	_keyexpansion: function (k) {

		keyschedule = [];

		for (var row = 0; row < keylength; row++) {
			keyschedule[row] = [
				k[row * 4],
				k[row * 4 + 1],
				k[row * 4 + 2],
				k[row * 4 + 3]
			];
		}

		for (var row = keylength; row < AES._blocksize * (nrounds + 1); row++) {

			var temp = [
				keyschedule[row - 1][0],
				keyschedule[row - 1][1],
				keyschedule[row - 1][2],
				keyschedule[row - 1][3]
			];

			if (row % keylength == 0) {

				// Rot word
				temp.push(temp.shift());

				// Sub word
				temp[0] = SBOX[temp[0]];
				temp[1] = SBOX[temp[1]];
				temp[2] = SBOX[temp[2]];
				temp[3] = SBOX[temp[3]];

				temp[0] ^= RCON[row / keylength];

			} else if (keylength > 6 && row % keylength == 4) {

				// Sub word
				temp[0] = SBOX[temp[0]];
				temp[1] = SBOX[temp[1]];
				temp[2] = SBOX[temp[2]];
				temp[3] = SBOX[temp[3]];

			}

			keyschedule[row] = [
				keyschedule[row - keylength][0] ^ temp[0],
				keyschedule[row - keylength][1] ^ temp[1],
				keyschedule[row - keylength][2] ^ temp[2],
				keyschedule[row - keylength][3] ^ temp[3]
			];

		}

	}

};

})();
