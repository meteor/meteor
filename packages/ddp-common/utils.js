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

  const hasFields = hasOwn.call(msg, 'fields');
  const hasParams = hasOwn.call(msg, 'params');
  const hasResult = hasOwn.call(msg, 'result');

  // Fast path: messages without fields/params/result need no EJSON conversion
  // (e.g. 'removed', 'ready', 'nosub', 'ping', 'pong')
  if (!hasFields && !hasParams && !hasResult) {
    return JSON.stringify(msg);
  }

  // Build wire-format object without cloning the entire message.
  // Uses EJSON.toJSONValue (copy-on-write) per field — only allocates new
  // objects for subtrees that actually contain EJSON types (Date, Binary, etc.).
  const wire = {};

  for (const key of Object.keys(msg)) {
    if (key === 'fields' || key === 'params' || key === 'result') {
      continue;
    }
    wire[key] = msg[key];
  }

  if (hasFields) {
    const cleared = [];
    const wireFields = {};
    let hasAnyField = false;

    for (const key of Object.keys(msg.fields)) {
      const value = msg.fields[key];
      if (typeof value === 'undefined') {
        cleared.push(key);
      } else {
        wireFields[key] = EJSON.toJSONValue(value);
        hasAnyField = true;
      }
    }

    if (hasAnyField) {
      wire.fields = wireFields;
    }
    if (cleared.length > 0) {
      wire.cleared = cleared;
    }
  }

  if (hasParams) {
    wire.params = EJSON.toJSONValue(msg.params);
  }

  if (hasResult) {
    wire.result = EJSON.toJSONValue(msg.result);
  }

  return JSON.stringify(wire);
};
