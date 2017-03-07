// For this global function to be defined, the --expose-gc flag must have
// been passed to node at the bottom of the ../../meteor script, probably
// via the TOOL_NODE_FLAGS environment variable.
const gc = global.gc;

// In the future, this function may become smarter about how often it
// actually calls the gc function, but that's an implementation detail.
export function requestGarbageCollection() {
  if (typeof gc === "function") {
    gc();
  }
}
