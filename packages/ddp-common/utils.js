"use strict";

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

DDPCommon.SUPPORTED_DDP_VERSIONS = [ '1', 'pre2', 'pre1' ];

// ---------------------------------------------------------------------------
// DDP protocol transforms
//
// These convert between the "abstract DDP" representation used internally
// (where cleared fields are represented as fields with value `undefined`)
// and the "wire DDP" representation (where cleared fields are sent as a
// separate `cleared` array).
//
// This is pure DDP protocol logic — no serialization happens here.
// ---------------------------------------------------------------------------

DDPCommon.toWireMessage = function (msg) {
  const copy = EJSON.clone(msg);

  if (hasOwn.call(msg, 'fields')) {
    const cleared = [];

    Object.keys(msg.fields).forEach(key => {
      if (typeof msg.fields[key] === 'undefined') {
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

  if (msg.id && typeof msg.id !== 'string') {
    throw new Error('Message id is not a string');
  }

  return copy;
};

DDPCommon.fromWireMessage = function (msg) {
  if (hasOwn.call(msg, 'cleared')) {
    if (!hasOwn.call(msg, 'fields')) {
      msg.fields = {};
    }
    msg.cleared.forEach(clearKey => {
      msg.fields[clearKey] = undefined;
    });
    delete msg.cleared;
  }
  return msg;
};

// ---------------------------------------------------------------------------
// Serializer
//
// A serializer encodes/decodes DDP wire messages to/from the transport format.
//
// Interface:
//   name:        string              — identifier ('ejson', 'cbor', ...)
//   wireFormat:  'text' | 'binary'   — determines transport frame type
//   serialize:   (wireMsg) → string | Uint8Array
//   deserialize: (raw) → object      — throws on invalid input
// ---------------------------------------------------------------------------

DDPCommon._serializer = null;

DDPCommon.setSerializer = function (serializer) {
  DDPCommon._serializer = serializer;
};

DDPCommon.getSerializer = function () {
  if (!DDPCommon._serializer) {
    // Lazy-init with default EJSON serializer
    DDPCommon._serializer = DDPCommon.createEJSONSerializer();
  }
  return DDPCommon._serializer;
};

DDPCommon.createEJSONSerializer = function () {
  return {
    name: 'ejson',
    wireFormat: 'text',

    serialize(wireMsg) {
      ['fields', 'params', 'result'].forEach(field => {
        if (hasOwn.call(wireMsg, field)) {
          wireMsg[field] = EJSON._adjustTypesToJSONValue(wireMsg[field]);
        }
      });
      return JSON.stringify(wireMsg);
    },

    deserialize(raw) {
      const msg = JSON.parse(raw);
      if (msg === null || typeof msg !== 'object') {
        throw new Error('DDP message is not an object');
      }
      ['fields', 'params', 'result'].forEach(field => {
        if (hasOwn.call(msg, field)) {
          msg[field] = EJSON._adjustTypesFromJSONValue(msg[field]);
        }
      });
      return msg;
    },
  };
};

// ---------------------------------------------------------------------------
// Backward-compatible wrappers
//
// These delegate to the protocol transforms + serializer. Existing code that
// calls DDPCommon.stringifyDDP / parseDDP continues to work unchanged.
// ---------------------------------------------------------------------------

DDPCommon.stringifyDDP = function (msg) {
  const wire = DDPCommon.toWireMessage(msg);
  return DDPCommon.getSerializer().serialize(wire);
};

DDPCommon.parseDDP = function (stringMessage) {
  try {
    const wireMsg = DDPCommon.getSerializer().deserialize(stringMessage);
    return DDPCommon.fromWireMessage(wireMsg);
  } catch (e) {
    Meteor._debug('Discarding message with invalid DDP', e);
    return null;
  }
};
