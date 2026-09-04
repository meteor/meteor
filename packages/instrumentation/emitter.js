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
  // The build runs on the observed method's stack: a throwing payload builder
  // must be contained here too — the never-throw guarantee covers construction,
  // not just listener calls. The failure is reported like a listener's; the
  // event is dropped rather than half-delivered.
  let event;
  try {
    event = buildEvent();
  } catch (error) {
    reportListenerError(error, { type });
    return;
  }
  // Snapshot: a listener registered during this emission only sees subsequent
  // events. Iterating the live Set would call it with the current event — and a
  // listener that keeps registering listeners would never let the loop end.
  for (const listener of [...set]) {
    callListener(listener, event);
  }
}
