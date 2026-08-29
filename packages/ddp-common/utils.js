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
  if (msg.id && typeof msg.id !== 'string') {
    throw new Error('Message id is not a string');
  }

  // Fast path: only `fields` needs transforming (cleared extraction), so
  // messages without it pass through untouched (e.g. 'ready', 'ping').
  if (msg.fields === undefined) {
    return msg;
  }

  // Build the wire-format object without cloning the entire message: only
  // `fields` is rebuilt, every other value is shared with the input. The
  // result may alias (or be) the input, so serializers must not mutate it.
  const wire = {};
  let cleared = null;
  let wireFields = null;

  for (const key in msg) {
    if (!hasOwn.call(msg, key)) continue;
    if (key === 'fields') {
      for (const fieldKey in msg.fields) {
        if (!hasOwn.call(msg.fields, fieldKey)) continue;
        const value = msg.fields[fieldKey];
        if (value === undefined) {
          (cleared ??= []).push(fieldKey);
        } else {
          (wireFields ??= {})[fieldKey] = value;
        }
      }
    } else {
      wire[key] = msg[key];
    }
  }

  if (wireFields !== null) wire.fields = wireFields;
  if (cleared !== null) wire.cleared = cleared;

  return wire;
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
//
// serialize() must not mutate its input: toWireMessage shares subtrees with
// (and for field-less messages, is) the abstract message.
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
      // Fast path: messages without fields/params/result need no EJSON
      // conversion (e.g. 'removed', 'ready', 'nosub', 'ping', 'pong')
      if (wireMsg.fields === undefined &&
          wireMsg.params === undefined &&
          wireMsg.result === undefined) {
        return JSON.stringify(wireMsg);
      }

      // Convert copy-on-write: EJSON.toJSONValue only allocates new objects
      // for subtrees that actually contain EJSON types (Date, Binary, etc.),
      // and the input message is never mutated.
      const out = {};
      for (const key in wireMsg) {
        if (!hasOwn.call(wireMsg, key)) continue;
        if (key === 'fields') {
          const fields = {};
          for (const fieldKey in wireMsg.fields) {
            if (!hasOwn.call(wireMsg.fields, fieldKey)) continue;
            fields[fieldKey] = EJSON.toJSONValue(wireMsg.fields[fieldKey]);
          }
          out.fields = fields;
        } else if (key === 'params' || key === 'result') {
          out[key] = EJSON.toJSONValue(wireMsg[key]);
        } else {
          out[key] = wireMsg[key];
        }
      }
      return JSON.stringify(out);
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
