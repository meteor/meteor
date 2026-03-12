"use strict";

import { EJSON } from 'meteor/ejson';
import { Base64 } from 'meteor/base64';

const cborx = require('cbor-x');

export const hasOwn = Object.prototype.hasOwnProperty;
export const slice = Array.prototype.slice;

export function keys(obj) {
  return Object.keys(Object(obj));
}

export function isEmpty(obj) {
  if (obj == null) {
    return true;
  }

  if (Array.isArray(obj) ||
      typeof obj === "string") {
    return obj.length === 0;
  }

  for (const key in obj) {
    if (hasOwn.call(obj, key)) {
      return false;
    }
  }

  return true;
}

export function last(array, n, guard) {
  if (array == null) {
    return;
  }

  if ((n == null) || guard) {
    return array[array.length - 1];
  }

  return slice.call(array, Math.max(array.length - n, 0));
}

// Serializer registry — pluggable wire format encoders/decoders.
// Each serializer must implement:
//   serialize(msg, { supportsBinary }) => string | Uint8Array
//   deserialize(data) => object | null
DDPCommon.SerializerRegistry = {
  _serializers: {},
  register(name, serializer) {
    this._serializers[name] = serializer;
  },
  get(name) {
    return this._serializers[name] || this._serializers['json'];
  }
};

// JSON serializer (default)
DDPCommon.SerializerRegistry.register('json', {
  serialize(msg) {
    return JSON.stringify(msg);
  },
  deserialize(data) {
    if (typeof data !== 'string') {
      return null;
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      Meteor._debug("Discarding message with invalid JSON", data);
      return null;
    }
  }
});

// CBOR serializer
DDPCommon.SerializerRegistry.register('cbor', {
  serialize(msg, options) {
    try {
      const encoded = cborx.encode(msg);
      if (options && options.supportsBinary) {
        return encoded; // Uint8Array for native WebSocket
      }
      return Base64.encode(encoded); // Base64 string for SockJS
    } catch (e) {
      Meteor._debug('CBOR encoding failed, falling back to JSON:', e);
      return JSON.stringify(msg);
    }
  },
  deserialize(data) {
    try {
      if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        const binaryData = data instanceof ArrayBuffer
          ? new Uint8Array(data) : data;
        return cborx.decode(binaryData);
      }
      if (typeof data === 'string') {
        // Base64-encoded CBOR for text-only transports
        const binaryData = Base64.decode(data);
        return cborx.decode(binaryData);
      }
    } catch (e) {
      Meteor._debug("Discarding message with invalid CBOR", e);
      return null;
    }
    return null;
  }
});

// Maps DDP version strings to serializer names.
DDPCommon.SERIALIZER_FOR_VERSION = {
  '1': 'json',
  '1.cbor': 'cbor',
  'pre2': 'json',
  'pre1': 'json',
};

// Order = client preference. '1' first preserves backward compatibility.
// NOTE: '1.cbor' is intentionally excluded until full infrastructure is in place.
DDPCommon.SUPPORTED_DDP_VERSIONS = ['1', 'pre2', 'pre1'];

// DDP protocol transforms: wire format ↔ abstract DDP format.
// These are protocol-level concerns, independent of serialization.

function wireToAbstract(msg) {
  // switch between "cleared" rep of unsetting fields and "undefined" rep
  if (hasOwn.call(msg, 'cleared')) {
    if (!hasOwn.call(msg, 'fields')) {
      msg.fields = {};
    }
    msg.cleared.forEach(clearKey => {
      msg.fields[clearKey] = undefined;
    });
    delete msg.cleared;
  }

  ['fields', 'params', 'result'].forEach(field => {
    if (hasOwn.call(msg, field)) {
      msg[field] = EJSON._adjustTypesFromJSONValue(msg[field]);
    }
  });

  return msg;
}

function abstractToWire(msg) {
  const copy = EJSON.clone(msg);

  // swizzle 'changed' messages from 'fields undefined' rep to 'fields
  // and cleared' rep
  if (hasOwn.call(msg, 'fields')) {
    const cleared = [];

    Object.keys(msg.fields).forEach(key => {
      const value = msg.fields[key];

      if (typeof value === "undefined") {
        cleared.push(key);
        delete copy.fields[key];
      }
    });

    if (!isEmpty(cleared)) {
      copy.cleared = cleared;
    }

    if (isEmpty(copy.fields)) {
      delete copy.fields;
    }
  }

  // adjust types to basic
  ['fields', 'params', 'result'].forEach(field => {
    if (hasOwn.call(copy, field)) {
      copy[field] = EJSON._adjustTypesToJSONValue(copy[field]);
    }
  });

  if (msg.id && typeof msg.id !== 'string') {
    throw new Error("Message id is not a string");
  }

  return copy;
}

DDPCommon.parseDDP = function (stringMessage, serializerName) {
  const serializer = DDPCommon.SerializerRegistry.get(serializerName || 'json');
  const msg = serializer.deserialize(stringMessage);

  if (msg === null || typeof msg !== 'object') {
    Meteor._debug("Discarding non-object DDP message", stringMessage);
    return null;
  }

  return wireToAbstract(msg);
};

DDPCommon.stringifyDDP = function (msg, options) {
  const copy = abstractToWire(msg);
  const serializerName = (options && options.serializer) || 'json';
  const serializer = DDPCommon.SerializerRegistry.get(serializerName);
  return serializer.serialize(copy, options);
};

