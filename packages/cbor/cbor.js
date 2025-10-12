// Unified CBOR implementation for client and server
import { Base64 } from 'meteor/base64';

// Import cbor-x package - available on both client and server
const cborx = require('cbor-x');

// Check if we're on server or client
const isServer = typeof process !== 'undefined' && process.versions && process.versions.node;
const isClient = !isServer;

// Semantic Tags for Meteor types (using private use range)
const METEOR_TAGS = {
  FILE: 65001,          // File object
  BUFFER: 65002,        // Buffer object  
  BLOB: 65003,          // Blob object
  DATE: 1,              // Standard date tag
  EJSON_DATE: 65004,    // EJSON date migration
  EJSON_BINARY: 65005,  // EJSON binary migration
  MONGO_OBJECTID: 65006, // MongoDB ObjectId
  REGEXP: 65007,        // RegExp object
  ERROR: 65008,         // Error object
  FUNCTION: 65009,      // Function object
  UNDEFINED: 65010,     // undefined value
  SYMBOL: 65011,        // Symbol object
  OBJECT: 65012         // Generic object (to avoid ID conflicts)
};

/**
 * @namespace
 * @summary Namespace for CBOR functions
 */
const CBOR = {};

/**
 * @summary Serialize a value to CBOR binary format
 * @locus Anywhere
 * @param {Any} value - Value to encode
 * @returns {Uint8Array} CBOR-encoded binary data
 */
CBOR.encode = function(value) {
  try {
    // Pre-process value to handle Meteor-specific types
    const processed = preprocessValue(value);
    
    // Use cbor-x for encoding
    return cborx.encode(processed);
  } catch (error) {
    // Handle encode errors gracefully by falling back to JSON
    return CBOR._handleEncodeError(value, error);
  }
};

/**
 * @summary Serialize a value to CBOR binary format (async version for File/Blob)
 * @locus Anywhere
 * @param {Any} value - Value to encode
 * @returns {Promise<Uint8Array>} Promise resolving to CBOR-encoded binary data
 */
CBOR.encodeAsync = async function(value) {
  // Handle async types that need special processing
  if (containsAsyncTypes(value)) {
    const processed = await processAsyncTypes(value);
    return cborx.encode(processed);
  }
  return CBOR.encode(value);
};

/**
 * @summary Deserialize CBOR binary data to JavaScript value
 * @locus Anywhere
 * @param {Uint8Array} data - CBOR-encoded binary data
 * @returns {Any} Decoded JavaScript value
 */
CBOR.decode = function(data) {
  try {
    // Validate CBOR data before attempting to decode
    if (!CBOR._isValidCBOR(data)) {
      // Try to handle invalid data gracefully
      return CBOR._handleInvalidCBOR(data);
    }
    
    // Use cbor-x for decoding
    const decoded = cborx.decode(data);
    return postprocessValue(decoded);
  } catch (error) {
    // Handle decode errors gracefully
    if (error.message.includes('Data read, but end of buffer not reached')) {
      return CBOR._handleIncompleteCBOR(data);
    } else if (error.message.includes('Invalid CBOR')) {
      return CBOR._handleInvalidCBOR(data);
    } else {
      // For other errors, try to recover or return a safe fallback
      return CBOR._handleDecodeError(data, error);
    }
  }
};

/**
 * @summary Convert value to JSON string (EJSON-compatible)
 * @locus Anywhere
 * @param {Any} value - Value to convert to JSON string
 * @param {Object} options - Optional formatting options (indent, canonical)
 * @returns {String} JSON string with EJSON extensions
 */
CBOR.stringify = function(value, options) {
  const json = CBOR.toJSONValue(value);
  if (options && (options.canonical || options.indent)) {
    // Use canonical/indented format if requested
    // For now, just use standard JSON.stringify with indent
    const indent = options.indent === true ? 2 : (options.indent || 0);
    return JSON.stringify(json, options.canonical ? Object.keys(json).sort() : null, indent);
  }
  return JSON.stringify(json);
};

/**
 * @summary Parse JSON string to JavaScript value (EJSON-compatible)
 * @locus Anywhere
 * @param {String} str - JSON string (with EJSON extensions like $binary, $date)
 * @returns {Any} Decoded JavaScript value
 */
CBOR.parse = function(str) {
  if (typeof str !== 'string') {
    throw new Error('CBOR.parse argument should be a string');
  }
  return CBOR.fromJSONValue(JSON.parse(str));
};

/**
 * @summary Clone a value using structural cloning (handles all supported types)
 * @locus Anywhere
 * @param {Any} value - Value to clone
 * @returns {Any} Deep cloned value
 */
CBOR.clone = function(value) {
  // Use structural clone like EJSON to preserve functions
  let ret;

  // Handle primitives and null
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Handle Date
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  // Handle RegExp (immutable, can return as-is)
  if (value instanceof RegExp) {
    return value;
  }

  // Handle binary data
  if (CBOR.isBinary(value)) {
    ret = CBOR.newBinary(value.length);
    for (let i = 0; i < value.length; i++) {
      ret[i] = value[i];
    }
    return ret;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(CBOR.clone);
  }

  // Handle custom types with clone method
  if (typeof value.clone === 'function') {
    return value.clone();
  }

  // Handle custom types with typeName/toJSONValue
  if (CBOR._isCustomType(value)) {
    return CBOR.fromJSONValue(CBOR.clone(CBOR.toJSONValue(value)));
  }

  // Handle plain objects
  ret = {};
  for (const key of Object.keys(value)) {
    ret[key] = CBOR.clone(value[key]);
  }
  return ret;
};

/**
 * @summary Clone a value using CBOR round-trip (async version)
 * @locus Anywhere
 * @param {Any} value - Value to clone
 * @returns {Promise<Any>} Promise resolving to deep cloned value
 */
CBOR.cloneAsync = async function(value) {
  const encoded = await CBOR.encodeAsync(value);
  return CBOR.decode(encoded);
};

/**
 * @summary Compare two values for equality using structural comparison
 * @locus Anywhere
 * @param {Any} a - First value
 * @param {Any} b - Second value
 * @param {Object} options - Comparison options (keyOrderSensitive: false by default)
 * @returns {Boolean} True if values are equal
 */
CBOR.equals = function(a, b, options) {
  const keyOrderSensitive = !!(options && options.keyOrderSensitive);

  // Fast path for identical references
  if (a === b) return true;

  // Handle NaN
  if (Number.isNaN(a) && Number.isNaN(b)) return true;

  // Handle falsy values
  if (!a || !b) return false;

  // Fast path for different types
  if (typeof a !== typeof b) return false;

  // Handle non-objects
  if (typeof a !== 'object') return false;

  // Handle Dates
  if (a instanceof Date && b instanceof Date) {
    return a.valueOf() === b.valueOf();
  }

  // Handle binary data
  if (CBOR.isBinary(a) && CBOR.isBinary(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // Handle custom types with equals method
  if (typeof a.equals === 'function') {
    return a.equals(b, options);
  }
  if (typeof b.equals === 'function') {
    return b.equals(a, options);
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!CBOR.equals(a[i], b[i], options)) return false;
    }
    return true;
  }

  // Different array status
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  // Handle custom types
  if (CBOR._isCustomType(a) || CBOR._isCustomType(b)) {
    if (!CBOR._isCustomType(a) || !CBOR._isCustomType(b)) return false;
    return CBOR.equals(CBOR.toJSONValue(a), CBOR.toJSONValue(b), options);
  }

  // Handle plain objects
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (keyOrderSensitive) {
    // Key order matters
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) return false;
      if (!CBOR.equals(a[aKeys[i]], b[bKeys[i]], options)) return false;
    }
    return true;
  } else {
    // Key order doesn't matter (default)
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.hasOwnProperty.call(b, key)) return false;
      if (!CBOR.equals(a[key], b[key], options)) return false;
    }
    return true;
  }
};

/**
 * @summary Get information about CBOR encoding efficiency vs JSON
 * @locus Anywhere
 * @param {Any} value - Value to analyze
 * @returns {Object} Size comparison information
 */
CBOR.analyze = function(value) {
  try {
    const cborData = CBOR.encode(value);
    
    // For comparison, try to convert to JSON (may fail for binary data)
    let jsonString, jsonBytes;
    try {
      jsonString = JSON.stringify(value);
      jsonBytes = new TextEncoder().encode(jsonString);
    } catch (jsonError) {
      // JSON can't handle binary data, so we'll compare with EJSON instead
      try {
        jsonString = JSON.stringify(CBOR.toJSONValue(value));
        jsonBytes = new TextEncoder().encode(jsonString);
      } catch (ejsonError) {
        return {
          cborSize: cborData.length,
          jsonSize: null,
          compressionRatio: null,
          savings: null,
          savingsPercent: null,
          note: "Value contains data types that cannot be compared with JSON"
        };
      }
    }
    
    const compressionRatio = jsonBytes.length / cborData.length;
    const savings = jsonBytes.length - cborData.length;
    const savingsPercent = Math.round((savings / jsonBytes.length) * 100);
    
    return {
      cborSize: cborData.length,
      jsonSize: jsonBytes.length,
      compressionRatio: compressionRatio,
      savings: savings,
      savingsPercent: savingsPercent,
      efficiency: compressionRatio > 1 ? 'CBOR is more efficient' : 
                 compressionRatio < 1 ? 'JSON is more efficient' : 'Equal efficiency'
    };
  } catch (e) {
    return {
      error: e.message,
      cborSize: null,
      jsonSize: null,
      compressionRatio: null,
      savings: null,
      savingsPercent: null
    };
  }
};

// Helper functions for preprocessing/postprocessing

function preprocessValue(obj) {
  // Handle functions - convert to serializable format
  // Note: Functions aren't truly serializable, but we provide a proxy for debugging
  if (typeof obj === 'function') {
    return {
      _meteorTag: METEOR_TAGS.FUNCTION,
      name: obj.name || 'anonymous',
      length: obj.length,
      toString: obj.toString()
    };
  }
  
  // Handle undefined - convert to null with special tag
  if (obj === undefined) {
    return {
      _meteorTag: METEOR_TAGS.UNDEFINED,
      value: null
    };
  }
  
  // Handle symbols - convert to serializable format
  if (typeof obj === 'symbol') {
    return {
      _meteorTag: METEOR_TAGS.SYMBOL,
      description: obj.description || '',
      toString: obj.toString()
    };
  }
  
  // Handle File objects (browser)
  if (typeof File !== 'undefined' && obj instanceof File) {
    throw new Error('File objects require async encoding. Use encodeAsync() instead.');
  }
  
  // Handle Blob objects (browser)
  if (typeof Blob !== 'undefined' && obj instanceof Blob) {
    throw new Error('Blob objects require async encoding. Use encodeAsync() instead.');
  }
  
  // Handle Buffer objects (server-side only)
  if (isServer && typeof Buffer !== 'undefined' && Buffer.isBuffer(obj)) {
    return {
      _meteorTag: METEOR_TAGS.BUFFER,
      data: new Uint8Array(obj)
    };
  }
  
  // Handle Uint8Array and other binary types
  // We need to preserve Uint8Array through CBOR encoding
  // Note: cbor-x handles Uint8Array natively as CBOR byte strings
  if (obj instanceof Uint8Array) {
    // cbor-x will encode this as a CBOR byte string (major type 2)
    return obj;
  }
  
  // Handle Date objects with custom tag
  if (obj instanceof Date) {
    return {
      _meteorTag: METEOR_TAGS.DATE,
      timestamp: obj.getTime() // Store full millisecond precision
    };
  }
  
  // Handle RegExp objects - cbor-x can't encode them directly
  if (obj instanceof RegExp) {
    return {
      _meteorTag: METEOR_TAGS.REGEXP,
      pattern: obj.source,
      flags: obj.flags
    };
  }
  
  // Handle Error objects - cbor-x can't encode them directly
  if (obj instanceof Error) {
    return {
      _meteorTag: METEOR_TAGS.ERROR,
      name: obj.name,
      message: obj.message,
      stack: obj.stack
    };
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => preprocessValue(item));
  }

  // Handle objects
  if (obj && typeof obj === 'object') {
    // Handle custom types (EJSON-style)
    if (typeof obj.typeName === 'function' && typeof obj.toJSONValue === 'function') {
      const typeName = obj.typeName();
      const jsonValue = obj.toJSONValue();
      return {
        _meteorCustomType: typeName,
        value: preprocessValue(jsonValue)
      };
    }

    // Check if this might be used as an ID (has _id property or is a simple object)
    if (obj._id !== undefined || (Object.keys(obj).length === 1 && typeof Object.values(obj)[0] === 'string')) {
      // This might be used as an ID, don't tag it
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = preprocessValue(value);
      }
      return result;
    }

    // Regular object processing
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = preprocessValue(value);
    }
    return result;
  }

  return obj;
}

function containsAsyncTypes(obj) {
  if (typeof File !== 'undefined' && obj instanceof File) return true;
  if (typeof Blob !== 'undefined' && obj instanceof Blob) return true;
  
  if (Array.isArray(obj)) {
    return obj.some(item => containsAsyncTypes(item));
  }
  
  if (obj && typeof obj === 'object' && !(obj instanceof Date) && !(obj instanceof Uint8Array)) {
    return Object.values(obj).some(value => containsAsyncTypes(value));
  }
  
  return false;
}

async function processAsyncTypes(obj) {
  if (typeof File !== 'undefined' && obj instanceof File) {
    const arrayBuffer = await obj.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    return {
      _meteorTag: METEOR_TAGS.FILE,
      data: Base64.encode(data),
      name: obj.name,
      type: obj.type,
      size: obj.size,
      lastModified: obj.lastModified
    };
  }
  
  if (typeof Blob !== 'undefined' && obj instanceof Blob) {
    const arrayBuffer = await obj.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    return {
      _meteorTag: METEOR_TAGS.BLOB,
      data: Base64.encode(data),
      type: obj.type,
      size: obj.size
    };
  }
  
  // Handle Buffer objects (server-side only)
  if (isServer && typeof Buffer !== 'undefined' && Buffer.isBuffer(obj)) {
    return {
      _meteorTag: METEOR_TAGS.BUFFER,
      data: new Uint8Array(obj)
    };
  }
  
  if (obj instanceof Uint8Array) {
    return obj; // Pass through for native CBOR binary encoding
  }

  if (obj instanceof Date) {
    return {
      _meteorTag: METEOR_TAGS.DATE,
      timestamp: obj.getTime() // Use full millisecond precision
    };
  }
  
  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => processAsyncTypes(item)));
  }
  
  if (obj && typeof obj === 'object' && !(obj instanceof Date) && !(obj instanceof Uint8Array)) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = await processAsyncTypes(value);
    }
    return result;
  }
  
  return obj;
}

function postprocessValue(obj) {
  // Handle custom types (EJSON-style)
  if (obj && typeof obj === 'object' && obj._meteorCustomType) {
    const typeName = obj._meteorCustomType;
    const processedValue = postprocessValue(obj.value);

    // Look up the factory function for this custom type
    if (CBOR._customTypes && CBOR._customTypes.has(typeName)) {
      const factory = CBOR._customTypes.get(typeName);
      return factory(processedValue);
    }

    // If no factory is registered, return the value as-is
    return processedValue;
  }

  // Handle tagged Meteor objects
  if (obj && typeof obj === 'object' && obj._meteorTag) {
    switch (obj._meteorTag) {
      case METEOR_TAGS.FILE:
        return reconstructFileObject(obj);
      case METEOR_TAGS.BUFFER:
        return reconstructBufferObject(obj);
      case METEOR_TAGS.BLOB:
        return reconstructBlobObject(obj);
      case METEOR_TAGS.DATE:
        return new Date(obj.timestamp); // Use full millisecond precision
      case METEOR_TAGS.EJSON_DATE:
        return new Date(obj.value);
      case METEOR_TAGS.REGEXP:
        return new RegExp(obj.pattern, obj.flags);
      case METEOR_TAGS.ERROR:
        const error = new Error(obj.message);
        error.name = obj.name;
        error.stack = obj.stack;
        return error;
      case METEOR_TAGS.FUNCTION:
        // Note: We can't recreate the actual function, so return a function-like object
        return {
          _isFunctionProxy: true,
          name: obj.name,
          length: obj.length,
          toString: obj.toString,
          // Add a call method that throws an error
          call: function() {
            throw new Error('Cannot call serialized function. Functions cannot be restored from CBOR.');
          }
        };
      case METEOR_TAGS.UNDEFINED:
        return undefined;
      case METEOR_TAGS.SYMBOL:
        // Note: We can't recreate the exact symbol, so return a symbol-like object
        return {
          _isSymbolProxy: true,
          description: obj.description,
          toString: obj.toString,
          valueOf: function() {
            throw new Error('Cannot convert serialized symbol to primitive value.');
          }
        };
      case METEOR_TAGS.EJSON_BINARY:
        return Base64.decode(obj.data);
      case METEOR_TAGS.OBJECT:
        // Generic object - remove the tag and return the object
        const { _meteorTag, ...rest } = obj;
        return rest;
      default:
        // Unknown tag - remove the tag and return the object
        const { _meteorTag: unknownTag, ...unknownRest } = obj;
        return unknownRest;
    }
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => postprocessValue(item));
  }

  // Handle objects
  if (obj && typeof obj === 'object' && !(obj instanceof Uint8Array) && !(obj instanceof Date)) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = postprocessValue(value);
    }
    return result;
  }

  return obj;
}

function reconstructFileObject(fileData) {
  const data = Base64.decode(fileData.data);
  
  if (typeof File !== 'undefined') {
    // Browser environment - create real File object
    return new File([data], fileData.name, {
      type: fileData.type,
      lastModified: fileData.lastModified
    });
  } else {
    // Server environment - create File-like object
    return {
      data: isServer && typeof Buffer !== 'undefined' ? Buffer.from(data) : data,
      name: fileData.name,
      type: fileData.type,
      size: fileData.size,
      lastModified: fileData.lastModified,
      _isFileProxy: true,
      
      // Add File-like methods
      arrayBuffer() {
        return Promise.resolve(this.data.buffer || this.data);
      },
      
      text() {
        const decoder = new TextDecoder();
        return Promise.resolve(decoder.decode(this.data));
      }
    };
  }
}

function reconstructBufferObject(bufferData) {
  if (isServer && typeof Buffer !== 'undefined') {
    return Buffer.from(bufferData.data);
  } else {
    // Client-side doesn't have Buffer, return Uint8Array
    return bufferData.data;
  }
}

function reconstructBlobObject(blobData) {
  const data = Base64.decode(blobData.data);
  
  if (typeof Blob !== 'undefined') {
    return new Blob([data], { type: blobData.type });
  } else {
    // Server environment - create Blob-like object
    return {
      data: isServer && typeof Buffer !== 'undefined' ? Buffer.from(data) : data,
      type: blobData.type,
      size: blobData.size,
      _isBlobProxy: true,
      
      arrayBuffer() {
        return Promise.resolve(this.data.buffer || this.data);
      },
      
      text() {
        const decoder = new TextDecoder();
        return Promise.resolve(decoder.decode(this.data));
      }
    };
  }
}

// Utility functions for type detection
CBOR._containsBinaryData = function(obj) {
  if (typeof File !== 'undefined' && obj instanceof File) return true;
  if (isServer && typeof Buffer !== 'undefined' && Buffer.isBuffer(obj)) return true;
  if (typeof Blob !== 'undefined' && obj instanceof Blob) return true;
  if (obj instanceof Uint8Array) return true;
  if (obj instanceof ArrayBuffer) return true;
  
  // Check for other TypedArray types
  if (typeof Int8Array !== 'undefined' && obj instanceof Int8Array) return true;
  if (typeof Uint16Array !== 'undefined' && obj instanceof Uint16Array) return true;
  if (typeof Int16Array !== 'undefined' && obj instanceof Int16Array) return true;
  if (typeof Uint32Array !== 'undefined' && obj instanceof Uint32Array) return true;
  if (typeof Int32Array !== 'undefined' && obj instanceof Int32Array) return true;
  if (typeof Float32Array !== 'undefined' && obj instanceof Float32Array) return true;
  if (typeof Float64Array !== 'undefined' && obj instanceof Float64Array) return true;
  
  if (Array.isArray(obj)) {
    return obj.some(item => CBOR._containsBinaryData(item));
  }
  
  if (obj && typeof obj === 'object') {
    return Object.values(obj).some(value => CBOR._containsBinaryData(value));
  }
  
  return false;
};

// Utility function to validate CBOR data
CBOR._isValidCBOR = function(data) {
  if (!data || !(data instanceof Uint8Array)) {
    return false;
  }
  
  if (data.length === 0) {
    return false;
  }
  
  // Basic CBOR validation - check first byte
  const firstByte = data[0];
  
  // CBOR major types and their valid ranges
  // Major type 0 (unsigned integer): 0x00-0x17
  // Major type 1 (negative integer): 0x20-0x37  
  // Major type 2 (byte string): 0x40-0x57
  // Major type 3 (text string): 0x60-0x77
  // Major type 4 (array): 0x80-0x97
  // Major type 5 (map): 0xa0-0xb7
  // Major type 6 (tag): 0xc0-0xd7
  // Major type 7 (float/simple): 0xe0-0xf7
  
  if (firstByte >= 0x00 && firstByte <= 0xf7) {
    return true;
  }
  
  // Additional bytes for larger values
  if (firstByte >= 0x18 && firstByte <= 0x1f) return true; // uint8, uint16, uint32, uint64
  if (firstByte >= 0x38 && firstByte <= 0x3f) return true; // int8, int16, int32, int64
  if (firstByte >= 0x58 && firstByte <= 0x5f) return true; // byte string with length
  if (firstByte >= 0x78 && firstByte <= 0x7f) return true; // text string with length
  if (firstByte >= 0x98 && firstByte <= 0x9f) return true; // array with length
  if (firstByte >= 0xb8 && firstByte <= 0xbf) return true; // map with length
  if (firstByte >= 0xd8 && firstByte <= 0xdf) return true; // tag with value
  if (firstByte >= 0xf8 && firstByte <= 0xff) return true; // simple value
  
  return false;
};

// Error handling functions for graceful recovery
CBOR._handleInvalidCBOR = function(data) {
  // Try to interpret as raw data or return a safe fallback
  if (!data || data.length === 0) {
    return null;
  }
  
  // If it looks like it might be JSON, try to parse it
  try {
    const text = new TextDecoder().decode(data);
    if (text.startsWith('{') || text.startsWith('[') || text.startsWith('"')) {
      return JSON.parse(text);
    }
  } catch (e) {
    // Not JSON, continue with other approaches
  }
  
  // If it's a small buffer, return it as a Uint8Array
  if (data.length < 1000) {
    return new Uint8Array(data);
  }
  
  // For larger invalid data, return a simple string representation
  // This avoids MongoDB selector issues
  return `[Invalid CBOR Data: ${data.length} bytes]`;
};

CBOR._handleIncompleteCBOR = function(data) {
  // Try to decode what we can from the incomplete data
  try {
    // Attempt partial decoding by trying different buffer lengths
    for (let len = data.length; len > 0; len--) {
      try {
        const partialData = data.slice(0, len);
        const decoded = cborx.decode(partialData);
        // Return the decoded value without error metadata to avoid MongoDB issues
        return postprocessValue(decoded);
      } catch (e) {
        // Continue trying shorter lengths
        continue;
      }
    }
  } catch (e) {
    // Fall through to safe fallback
  }
  
  // If partial decoding fails, return a simple string representation
  return `[Incomplete CBOR Data: ${data.length} bytes]`;
};

CBOR._handleDecodeError = function(data, error) {
  // For other decode errors, try to extract what we can
  try {
    // Try to interpret as text data
    const text = new TextDecoder().decode(data);
    return text; // Return the text directly instead of an error object
  } catch (e) {
    // Return a simple string representation
    return `[CBOR Decode Error: ${error.message}]`;
  }
};

CBOR._handleEncodeError = function(value, error) {
  // Try to encode as JSON and then convert to CBOR
  try {
    const jsonString = JSON.stringify(value);
    const jsonBytes = new TextEncoder().encode(jsonString);
    
    // Encode the JSON string directly instead of wrapping in error object
    return cborx.encode(jsonString);
  } catch (jsonError) {
    // If even JSON fails, encode a simple string representation
    const stringValue = String(value);
    return cborx.encode(stringValue);
  }
};

// EJSON compatibility layer
CBOR.addType = function(name, factory) {
  // Store custom type factory for later use
  CBOR._customTypes = CBOR._customTypes || new Map();
  CBOR._customTypes.set(name, factory);
};

CBOR.isBinary = function(obj) {
  if (isServer && typeof Buffer !== 'undefined' && Buffer.isBuffer(obj)) return true;
  return obj instanceof Uint8Array;
};

CBOR.newBinary = function(size) {
  return new Uint8Array(size);
};

CBOR.toJSONValue = function(value) {
  // Convert to EJSON-style JSON representation

  // Handle custom types first
  if (value && typeof value === 'object' && typeof value.typeName === 'function' && typeof value.toJSONValue === 'function') {
    return {
      $type: value.typeName(),
      $value: CBOR.toJSONValue(value.toJSONValue())
    };
  }

  if (isServer && typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return { $binary: Base64.encode(value) };
  }
  if (value instanceof Uint8Array) {
    return { $binary: Base64.encode(value) };
  }
  if (value instanceof Date) {
    return { $date: value.getTime() };
  }
  if (Array.isArray(value)) {
    return value.map(item => CBOR.toJSONValue(item));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = CBOR.toJSONValue(val);
    }
    return result;
  }
  return value;
};

CBOR.fromJSONValue = function(value) {
  // Convert from EJSON-style JSON representation
  if (value && typeof value === 'object') {
    // Handle custom types
    if (value.$type && value.$value !== undefined) {
      const typeName = value.$type;
      const processedValue = CBOR.fromJSONValue(value.$value);

      // Look up the factory function for this custom type
      if (CBOR._customTypes && CBOR._customTypes.has(typeName)) {
        const factory = CBOR._customTypes.get(typeName);
        return factory(processedValue);
      }

      // If no factory is registered, return the value as-is
      return processedValue;
    }

    if (value.$binary) {
      return Base64.decode(value.$binary);
    }
    if (value.$date) {
      return new Date(value.$date);
    }
    if (Array.isArray(value)) {
      return value.map(item => CBOR.fromJSONValue(item));
    }
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = CBOR.fromJSONValue(val);
    }
    return result;
  }
  return value;
};

CBOR._isCustomType = function(obj) {
  if (!CBOR._customTypes) return false;
  return obj && typeof obj === 'object' && obj.constructor &&
         CBOR._customTypes.has(obj.constructor.name);
};

// EJSON compatibility - migration helpers
CBOR.fromEJSON = function(ejsonValue) {
  // Convert from EJSON format to CBOR-compatible format
  return CBOR.fromJSONValue(ejsonValue);
};

CBOR.toEJSON = function(value) {
  // Convert to EJSON-compatible format
  return CBOR.toJSONValue(value);
};

// Capability detection
CBOR.hasBinaryData = function(obj) {
  return CBOR._containsBinaryData(obj);
};

// Export CBOR
export { CBOR };