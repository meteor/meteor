var limits = require("./request-limits.js");
var hasOwn = Object.prototype.hasOwnProperty;

// Buffer and TextEncoder are not available on all supported browser targets.
function byteLength(text) {
  var bytes = 0;
  for (var i = 0; i < text.length; i += 1) {
    var code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff &&
      i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 &&
      text.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

function newNode(value) {
  return { value: value, children: Object.create(null), count: 0 };
}

// Pack complete leaves, not arbitrary subtrees: a single wide directory or
// transitive graph can exceed the server caps even when its paths are valid.
// Accounting is incremental; do not serialize the whole graph for every leaf.
exports.makeRequestBodies = function (tree) {
  var bodies = [];
  var batch;
  function reset() {
    batch = { root: newNode(Object.create(null)), nodes: 1, bytes: 2 };
  }
  reset();

  function add(parts) {
    var node = batch.root;
    var index = 0;
    while (index < parts.length && hasOwn.call(node.children, parts[index])) {
      node = node.children[parts[index]];
      index += 1;
    }
    var extraNodes = parts.length - index;
    var extraBytes = index < parts.length && node.count > 0 ? 1 : 0;
    for (var i = index; i < parts.length; i += 1) {
      extraBytes += byteLength(JSON.stringify(parts[i])) +
        (i < parts.length - 1 ? 3 : 2); // colon + {} or 1
    }
    if ((extraNodes > 0 && node.count >= limits.MAX_KEYS_PER_OBJECT) ||
      batch.nodes + extraNodes > limits.MAX_TREE_NODES ||
      batch.bytes + extraBytes > limits.MAX_REQUEST_BYTES) return false;

    for (; index < parts.length; index += 1) {
      var name = parts[index];
      var value = index < parts.length - 1 ? Object.create(null) : 1;
      var child = newNode(value);
      node.value[name] = value;
      node.children[name] = child;
      node.count += 1;
      node = child;
    }
    batch.nodes += extraNodes;
    batch.bytes += extraBytes;
    return true;
  }

  var stack = [{ node: tree, parts: [], pathBytes: 0 }];
  while (stack.length > 0) {
    var frame = stack.pop();
    if (frame.node === 1 && frame.parts.length > 0) {
      if (!add(frame.parts)) {
        bodies.push(JSON.stringify(batch.root.value));
        reset();
        if (!add(frame.parts)) throw new Error("dynamic import path cannot fit in a request");
      }
      continue;
    }
    if (!frame.node || typeof frame.node !== "object" || Array.isArray(frame.node)) {
      throw new Error("dynamic import tree leaves must equal 1");
    }
    var keys = Object.keys(frame.node);
    for (var k = keys.length - 1; k >= 0; k -= 1) {
      var key = keys[k];
      var keyBytes = byteLength(key);
      var pathBytes = frame.pathBytes + (frame.parts.length > 0 ? 1 : 0) + keyBytes;
      if (!key || key === "." || key === ".." || key.indexOf("\0") >= 0 ||
        key.indexOf("/") >= 0 || key.indexOf("\\") >= 0 ||
        keyBytes > limits.MAX_KEY_BYTES || pathBytes > limits.MAX_PATH_BYTES ||
        frame.parts.length + 1 > limits.MAX_TREE_DEPTH) {
        throw new Error("invalid dynamic import path");
      }
      stack.push({ node: frame.node[key], parts: frame.parts.concat(key), pathBytes: pathBytes });
    }
  }
  if (batch.nodes > 1 || bodies.length === 0) bodies.push(JSON.stringify(batch.root.value));
  return bodies;
};
