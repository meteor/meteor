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
