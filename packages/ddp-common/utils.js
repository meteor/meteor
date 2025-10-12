"use strict";

import { CBOR } from 'meteor/harry97:cbor';
import { Base64 } from 'meteor/base64';

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
  var msg;

  // Try to detect if this is binary CBOR (base64-encoded) or JSON
  // Binary CBOR messages won't start with '{' or '['
  const isBinaryCBOR = stringMessage && stringMessage[0] !== '{' && stringMessage[0] !== '[';

  if (isBinaryCBOR && DDPCommon._useBinaryCBOR()) {
    // Try to parse as base64-encoded CBOR
    try {
      const binaryData = Base64.decode(stringMessage);
      msg = CBOR.decode(binaryData);
    } catch (e) {
      // Fallback to JSON parsing
      try {
        msg = JSON.parse(stringMessage);
      } catch (jsonError) {
        Meteor._debug("Discarding message with invalid CBOR and JSON", stringMessage);
        return null;
      }
    }
  } else {
    // Standard JSON parsing
    try {
      msg = JSON.parse(stringMessage);
    } catch (e) {
      Meteor._debug("Discarding message with invalid JSON", stringMessage);
      return null;
    }
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
      msg[field] = CBOR._adjustTypesFromJSONValue(msg[field]);
    }
  });

  return msg;
};

// Check if binary CBOR mode is enabled via environment variable
DDPCommon._useBinaryCBOR = function() {
  // Check environment variable (works in both Node.js and Meteor)
  if (typeof process !== 'undefined' && process.env && process.env.METEOR_DDP_CBOR_BINARY === '1') {
    return true;
  }
  return false;
};

DDPCommon.stringifyDDP = function (msg) {
  const copy = CBOR.clone(msg);

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

    if (! isEmpty(cleared)) {
      copy.cleared = cleared;
    }

    if (isEmpty(copy.fields)) {
      delete copy.fields;
    }
  }

  // adjust types to basic
  ['fields', 'params', 'result'].forEach(field => {
    if (hasOwn.call(copy, field)) {
      copy[field] = CBOR._adjustTypesToJSONValue(copy[field]);
    }
  });

  if (msg.id && typeof msg.id !== 'string') {
    throw new Error("Message id is not a string");
  }

  // Use binary CBOR mode if enabled
  if (DDPCommon._useBinaryCBOR()) {
    try {
      const binaryCBOR = CBOR.encode(copy);
      return Base64.encode(binaryCBOR);
    } catch (e) {
      // Fallback to JSON on error
      console.error('Binary CBOR encoding failed, falling back to JSON:', e);
      return JSON.stringify(copy);
    }
  }

  return JSON.stringify(copy);
};


