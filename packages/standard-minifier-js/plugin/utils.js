"use strict";

const codeOfA = "A".charCodeAt(0);
const codeOfZ = "Z".charCodeAt(0);

export function isObject(value) {
  return typeof value === "object" && value !== null;
}

// Without a complete list of Node .type names, we have to settle for this
// fuzzy matching of object shapes. However, the infeasibility of
// maintaining a complete list of type names is one of the reasons we're
// using the FastPath/Visitor abstraction in the first place.
export function isNodeLike(value) {
  return isObject(value) &&
    ! Array.isArray(value) &&
    isCapitalized(value.type);
}

function isCapitalized(string) {
  if (typeof string !== "string") {
    return false;
  }
  const code = string.charCodeAt(0);
  return code >= codeOfA && code <= codeOfZ;
}
