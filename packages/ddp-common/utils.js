"use strict";

import { CBOR } from 'meteor/harry97:cbor';

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
      msg[field] = CBOR._adjustTypesFromJSONValue(msg[field]);
    }
  });

  return msg;
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

  return JSON.stringify(copy);
};

// Enhanced DDP message serialization with CBOR support
DDPCommon.stringifyDDPWithCBOR = function (msg, options = {}) {
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

  // Check if message contains binary data that would benefit from CBOR
  const hasBinaryData = CBOR.hasBinaryData(copy);
  const useCBOR = options.supportsCBOR && (hasBinaryData || options.preferCBOR);

  if (useCBOR) {
    // Use CBOR encoding for binary-heavy messages
    return {
      format: 'cbor',
      data: CBOR.stringify(copy),
      metadata: {
        hasBinaryData: hasBinaryData,
        size: copy.toString ? copy.toString().length : 0
      }
    };
  } else {
    // Use traditional EJSON for compatibility
    ['fields', 'params', 'result'].forEach(field => {
      if (hasOwn.call(copy, field)) {
        copy[field] = CBOR._adjustTypesToJSONValue(copy[field]);
      }
    });

    if (msg.id && typeof msg.id !== 'string') {
      throw new Error("Message id is not a string");
    }

    return {
      format: 'ejson',
      data: JSON.stringify(copy)
    };
  }
};

// Async version for File/Blob objects
DDPCommon.stringifyDDPWithCBORAsync = async function (msg, options = {}) {
  const copy = CBOR.clone(msg);

  // Handle cleared fields
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

  const hasBinaryData = CBOR.hasBinaryData(copy);
  const useCBOR = options.supportsCBOR && (hasBinaryData || options.preferCBOR);

  if (useCBOR) {
    // Use async CBOR encoding for File/Blob objects
    const cborData = await CBOR.stringifyAsync(copy);
    return {
      format: 'cbor',
      data: cborData,
      metadata: {
        hasBinaryData: hasBinaryData,
        originalSize: JSON.stringify(copy).length,
        cborSize: cborData.length
      }
    };
  } else {
    // Fallback to sync EJSON
    return DDPCommon.stringifyDDP(msg);
  }
};

// Enhanced DDP message parsing with CBOR support
DDPCommon.parseDDPWithCBOR = function (message) {
  let stringMessage, messageFormat;

  // Handle both old string format and new object format
  if (typeof message === 'string') {
    stringMessage = message;
    messageFormat = 'ejson';
  } else if (message && typeof message === 'object') {
    if (message.format && message.data) {
      stringMessage = message.data;
      messageFormat = message.format;
    } else {
      // Assume it's already a parsed object
      return message;
    }
  } else {
    Meteor._debug("Invalid DDP message format", message);
    return null;
  }

  let msg;
  try {
    if (messageFormat === 'cbor') {
      msg = CBOR.parse(stringMessage);
    } else {
      // Default to EJSON parsing
      msg = JSON.parse(stringMessage);
    }
  } catch (e) {
    Meteor._debug("Discarding message with invalid format", stringMessage, e);
    return null;
  }

  // DDP messages must be objects
  if (msg === null || typeof msg !== 'object') {
    Meteor._debug("Discarding non-object DDP message", stringMessage);
    return null;
  }

  // Only apply EJSON transformations if using EJSON format
  if (messageFormat !== 'cbor') {
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
  }

  return msg;
};

// Protocol capability negotiation
DDPCommon.negotiateCapabilities = function (clientCaps, serverCaps) {
  const common = {
    ddpVersion: '1',
    ejson: true,
    cbor: false,
    binaryStreaming: false
  };

  if (clientCaps && serverCaps) {
    common.cbor = !!(clientCaps.cbor && serverCaps.cbor);
    common.binaryStreaming = !!(clientCaps.binaryStreaming && serverCaps.binaryStreaming);
    
    // Choose preferred DDP version
    if (clientCaps.ddpVersions && serverCaps.ddpVersions) {
      const commonVersions = clientCaps.ddpVersions.filter(v => 
        serverCaps.ddpVersions.includes(v)
      );
      if (commonVersions.length > 0) {
        common.ddpVersion = commonVersions[0]; // Take the first (highest priority)
      }
    }
  }

  return common;
};

// Utility to determine best serialization format
DDPCommon.chooseBestFormat = function (message, capabilities) {
  if (!capabilities.cbor) {
    return 'ejson';
  }

  // Use CBOR for messages with binary data
  if (CBOR.hasBinaryData(message)) {
    return 'cbor';
  }

  // Use CBOR for large method calls (>1KB) for better compression
  const jsonString = JSON.stringify(message);
  if (jsonString.length > 1024) {
    return 'cbor';
  }

  // Default to EJSON for small, simple messages
  return 'ejson';
};
