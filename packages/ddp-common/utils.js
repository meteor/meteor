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
// DDP wire-format helpers
//
// Internally, a cleared field is a field whose value is `undefined`. On the
// wire, cleared fields travel in a separate `cleared` array. These helpers
// convert between the two representations for serializers that encode the
// wire form generically. The built-in EJSON serializer below does the same
// transform inline, in a single pass, so the default path pays no extra copy.
// ---------------------------------------------------------------------------

DDPCommon.toWireMessage = function (msg) {
  if (msg.id && typeof msg.id !== 'string') {
    throw new Error("Message id is not a string");
  }

  // Only `fields` can carry cleared entries: messages without it, and
  // messages whose fields are all set, are returned as-is.
  const fields = msg.fields;
  if (fields === undefined) {
    return msg;
  }
  let cleared = null;
  for (const key in fields) {
    if (hasOwn.call(fields, key) && fields[key] === undefined) {
      (cleared ??= []).push(key);
    }
  }
  if (cleared === null) {
    return msg;
  }

  // Rebuild only `fields`; every other value is shared with the input, so
  // the result must be treated as read-only.
  const wire = {};
  let wireFields = null;
  for (const key in msg) {
    if (!hasOwn.call(msg, key)) continue;
    if (key === 'fields') {
      for (const fieldKey in fields) {
        if (!hasOwn.call(fields, fieldKey)) continue;
        const value = fields[fieldKey];
        if (value !== undefined) {
          (wireFields ??= {})[fieldKey] = value;
        }
      }
    } else {
      wire[key] = msg[key];
    }
  }
  if (wireFields !== null) wire.fields = wireFields;
  wire.cleared = cleared;
  return wire;
};

DDPCommon.fromWireMessage = function (msg) {
  // switch between "cleared" rep of unsetting fields and "undefined"
  // rep of same
  if (hasOwn.call(msg, 'cleared')) {
    if (! hasOwn.call(msg, 'fields')) {
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
// A serializer converts DDP messages to and from the transport payload.
//
// Interface:
//   name:        string              — identifier ('ejson', ...)
//   wireFormat:  'text' | 'binary'   — frame type the transport must use
//   serialize:   (msg) → string | Uint8Array; must not mutate `msg`
//   deserialize: (raw) → msg; throws on invalid input
//
// `msg` is the internal representation (cleared fields as `undefined`).
// Serializers that encode the wire form generically can build it with
// DDPCommon.toWireMessage and restore it with DDPCommon.fromWireMessage.
// ---------------------------------------------------------------------------

function ejsonSerialize(msg) {
  if (msg.id && typeof msg.id !== 'string') {
    throw new Error("Message id is not a string");
  }

  // Fast path: messages without fields/params/result need no EJSON conversion
  // (e.g. 'removed', 'ready', 'nosub', 'ping', 'pong')
  if (msg.fields === undefined && msg.params === undefined && msg.result === undefined) {
    return JSON.stringify(msg);
  }

  // Build wire-format object without cloning the entire message.
  // Uses EJSON.toJSONValue (copy-on-write) per field — only allocates new
  // objects for subtrees that actually contain EJSON types (Date, Binary, etc.).
  const wire = {};
  let cleared = null;
  let wireFields = null;

  for (const key in msg) {
    if (!hasOwn.call(msg, key)) continue;
    switch (key) {
      case 'fields':
        for (const fieldKey in msg.fields) {
          if (!hasOwn.call(msg.fields, fieldKey)) continue;
          const value = msg.fields[fieldKey];
          if (value === undefined) {
            (cleared ??= []).push(fieldKey);
          } else {
            (wireFields ??= {})[fieldKey] = EJSON.toJSONValue(value);
          }
        }
        break;
      case 'params':
        wire.params = EJSON.toJSONValue(msg.params);
        break;
      case 'result':
        wire.result = EJSON.toJSONValue(msg.result);
        break;
      default:
        wire[key] = msg[key];
    }
  }

  if (wireFields !== null) wire.fields = wireFields;
  if (cleared !== null) wire.cleared = cleared;

  return JSON.stringify(wire);
}

function ejsonDeserialize(raw) {
  const msg = JSON.parse(raw);
  // DDP messages must be objects.
  if (msg === null || typeof msg !== 'object') {
    throw new Error("DDP message is not an object");
  }

  // massage msg to get it into "abstract ddp" rather than "wire ddp" format.
  DDPCommon.fromWireMessage(msg);

  ['fields', 'params', 'result'].forEach(field => {
    if (hasOwn.call(msg, field)) {
      msg[field] = EJSON._adjustTypesFromJSONValue(msg[field]);
    }
  });

  return msg;
}

DDPCommon.createEJSONSerializer = function () {
  return {
    name: 'ejson',
    wireFormat: 'text',
    serialize: ejsonSerialize,
    deserialize: ejsonDeserialize,
  };
};

function discardFrame(raw, error) {
  Meteor._debug("Discarding message with invalid DDP", raw, error.message);
  return null;
}

// parseDDP keeps its historical contract: null for any frame that cannot be
// decoded, whatever the serializer throws.
function ejsonParseDDP(raw) {
  try {
    return ejsonDeserialize(raw);
  } catch (e) {
    return discardFrame(raw, e);
  }
}

// ---------------------------------------------------------------------------
// Entry points used by ddp-client and ddp-server.
//
// With the default EJSON serializer, stringifyDDP and parseDDP ARE the EJSON
// functions: no extra call frame on the default path, so its cost and V8
// inlining behavior are exactly those of the previous implementation. Any
// other serializer installed with setSerializer() is reached through a thin
// wrapper. Callers look the entry points up on DDPCommon at call time.
// ---------------------------------------------------------------------------

let serializer = null;

DDPCommon.setSerializer = function (newSerializer) {
  serializer = newSerializer;
  if (newSerializer.serialize === ejsonSerialize &&
      newSerializer.deserialize === ejsonDeserialize) {
    DDPCommon.stringifyDDP = ejsonSerialize;
    DDPCommon.parseDDP = ejsonParseDDP;
    return;
  }
  DDPCommon.stringifyDDP = function (msg) {
    return newSerializer.serialize(msg);
  };
  DDPCommon.parseDDP = function (raw) {
    try {
      return newSerializer.deserialize(raw);
    } catch (e) {
      return discardFrame(raw, e);
    }
  };
};

DDPCommon.getSerializer = function () {
  return serializer;
};

DDPCommon.setSerializer(DDPCommon.createEJSONSerializer());
