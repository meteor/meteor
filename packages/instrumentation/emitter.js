// Read-only event emitter for the instrumentation seam.
//
// Two guarantees the rest of the package relies on:
//   - Lazy: a payload is built only when at least one listener is registered for
//     the event type (the build callback is not even called otherwise).
//   - Best-effort: a listener that throws synchronously, or returns a rejected
//     promise, can never break the emitting method/publication, and never
//     produces an unhandledRejection.

const listeners = new Map(); // type -> Set<listener>
let listenerErrorHandler = null;

export function setListenerErrorHandler(fn) {
  listenerErrorHandler = typeof fn === 'function' ? fn : null;
}

export function on(type, listener) {
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(listener);
  return {
    stop() {
      const current = listeners.get(type);
      if (current) current.delete(listener);
    },
  };
}

function reportListenerError(error, event) {
  if (!listenerErrorHandler) return;
  // The error reporter itself must never throw into the framework.
  try {
    listenerErrorHandler(error, event);
  } catch (_ignored) {
    // swallow — instrumentation observes, it never breaks the caller.
  }
}

function callListener(listener, event) {
  try {
    const result = listener(event);
    // Two-arg .then so a rejection is captured without swallowing success-path
    // bugs, and no unhandledRejection escapes. We never await the listener.
    if (result && typeof result.then === 'function') {
      result.then(undefined, (error) => reportListenerError(error, event));
    }
  } catch (error) {
    reportListenerError(error, event);
  }
}

// buildEvent: () => payload. Only invoked when listeners exist (lazy).
export function emit(type, buildEvent) {
  const set = listeners.get(type);
  if (!set || set.size === 0) return;
  const event = buildEvent();
  for (const listener of set) {
    callListener(listener, event);
  }
}
