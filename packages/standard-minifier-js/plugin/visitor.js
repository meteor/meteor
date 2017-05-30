"use strict";

import {
  isObject,
  isNodeLike,
} from "./utils.js";

const codeOfUnderscore = "_".charCodeAt(0);

export default class Visitor {
  visit(root) {
    this.reset.apply(this, arguments);
    this.visitWithoutReset(root);
  }

  visitWithoutReset(node) {
    if (Array.isArray(node)) {
      node.forEach(this.visitWithoutReset, this);
    } else if (isNodeLike(node)) {
      const method = this["visit" + node.type];
      if (typeof method === "function") {
        // The method must call this.visitChildren(node) to continue
        // traversing.
        method.call(this, node);
      } else {
        this.visitChildren(node);
      }
    }
  }

  visitChildren(node) {
    if (! isNodeLike(node)) {
      return;
    }

    const keys = Object.keys(node);
    const keyCount = keys.length;

    for (let i = 0; i < keyCount; ++i) {
      const key = keys[i];

      if (key === "loc" || // Ignore .loc.{start,end} objects.
          // Ignore "private" properties added by Babel.
          key.charCodeAt(0) === codeOfUnderscore) {
        continue;
      }

      const child = node[key];
      if (! isObject(child)) {
        // Ignore properties whose values aren't objects.
        continue;
      }

      this.visitWithoutReset(child);
    }
  }
}
