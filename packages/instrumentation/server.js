import { Meteor } from 'meteor/meteor';
import { on, setListenerErrorHandler } from './emitter.js';
import { currentContext } from './context.js';
import { configure as configurePolicy, configureMethod } from './policy.js';
import { _emit } from './events.js';

function configure(options) {
  configurePolicy(options);
  if (options && 'onListenerError' in options) {
    setListenerErrorHandler(options.onListenerError);
  }
}

// DDP connection open/close — the public, transport-agnostic API. No core change.
// Wired at startup (not load) so we don't need a build-time dependency on
// ddp-server (which weakly depends on us); by startup it is loaded and
// Meteor.onConnection is available, with no connection opened yet.
Meteor.startup(() => {
  Meteor.onConnection((connection) => {
    const openedAt = Date.now();
    _emit('ddp.connection.open', {
      connectionId: connection.id,
      // Raw material only; emitted just when the captureClientAddress policy is
      // on (gated in events.js). PII, off by default.
      clientAddress: connection.clientAddress,
    });
    connection.onClose(() => {
      _emit('ddp.connection.close', {
        connectionId: connection.id,
        durationMs: Date.now() - openedAt,
      });
    });
  });
});

export const Instrumentation = {
  on,
  currentContext,
  configure,
  configureMethod,
  // Internal: the emission entry point the ddp-server seam calls via
  // Package['instrumentation'].Instrumentation._emit(type, raw).
  _emit,
};
