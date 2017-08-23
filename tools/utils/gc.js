import { throttle } from "underscore";

export const requestGarbageCollection =
  // For this global function to be defined, the --expose-gc flag must
  // have been passed to node at the bottom of the ../../meteor script,
  // probably via the TOOL_NODE_FLAGS environment variable.
  typeof global.gc === "function"
    // Restrict actual garbage collections to once per 500ms.
    ? throttle(global.gc, 500)
    : function () {};
