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

DDPCommon.parseDDP = function (stringMessage) {
  try {
    var msg = JSON.parse(stringMessage);
  } catch (e) {
    Meteor._debug("Discarding message with invalid JSON", stringMessage);
    return null;
  }
  // DDP messages must be objects.
  if (msg === null || typeof msg !== 'object') {
    Meteor._debug("Discarding non-object DDP message", stringMessage);
    return null;
  }

  // massage msg to get it into "abstract ddp" rather than "wire ddp" format.

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

  ['fields', 'params', 'result'].forEach(field => {
    if (hasOwn.call(msg, field)) {
      msg[field] = EJSON._adjustTypesFromJSONValue(msg[field]);
    }
  });

  return msg;
};

DDPCommon.stringifyDDP = function (msg) {
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
};
