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

DDPCommon.SUPPORTED_DDP_VERSIONS = [ '2', '1', 'pre2', 'pre1' ];

DDPCommon.parseDDP = function (stringMessage) {
  try {
    var messages = JSON.parse(stringMessage);
  } catch (e) {
    Meteor._debug("Discarding message with invalid JSON", stringMessage);
    return null;
  }

  // Convert all DDP messages to Array form
  messages = Array.isArray(messages) ? messages : [messages];

  for (let i = 0; i < messages.length; i++) {
    var msg = messages[i];

    // Each individual DDP message must be an object.
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
  }

  return messages;
};

DDPCommon.stringifyDDP = function (messages) {
  messages = Array.isArray(messages) ? messages : [messages];

  const clonedMessages = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // swizzle 'changed' messages from 'fields undefined' rep to 'fields
    // and cleared' rep
    if (hasOwn.call(msg, 'fields')) {
      const cleared = [];

      Object.keys(msg.fields).forEach(key => {
        const value = msg.fields[key];

        if (typeof value === "undefined") {
          cleared.push(key);
          delete msg.fields[key];
        }
      });

      if (! isEmpty(cleared)) {
        msg.cleared = cleared;
      }

      if (isEmpty(msg.fields)) {
        delete msg.fields;
      }
    }

    // adjust types to basic
    ['fields', 'params', 'result'].forEach(field => {
      if (hasOwn.call(msg, field)) {
        msg[field] = EJSON._adjustTypesToJSONValue(msg[field]);
      }
    });

    if (msg.id && typeof msg.id !== 'string') {
      throw new Error("Message id is not a string");
    }

    clonedMessages.push(EJSON.clone(msg));
  }

  return JSON.stringify(clonedMessages);
};
