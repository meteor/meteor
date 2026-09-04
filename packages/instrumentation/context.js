import { DDP } from 'meteor/ddp-client';
import { Random } from 'meteor/random';

// Per-invocation trace context. We read the invocation Meteor 3 already set up
// (DDP._Current*Invocation are AsyncLocalStorage-backed) and lazily cache a
// traceId/spanId on it via a PRIVATE, module-local Symbol — so the same
// invocation always reports the same ids, and a `*.start` event matches what the
// handler later reads through currentContext(). Needs no core change.

const INSTRUMENTATION_CONTEXT = Symbol('meteor.instrumentation.context');
const newId = () => Random.id();
// Frozen: returned by reference from currentContext() outside any invocation,
// so a misbehaving consumer must not be able to mutate it for everyone else.
const EMPTY = Object.freeze({ traceId: null, spanId: null, userId: null, connectionId: null, kind: null, name: null });

function currentInvocation() {
  const m = DDP._CurrentMethodInvocation.get();
  if (m) return { inv: m, kind: 'method' };
  const p = DDP._CurrentPublicationInvocation.get();
  if (p) return { inv: p, kind: 'publication' };
  return null;
}

// Mint once per invocation, then reuse.
function traceIds(inv) {
  let ids = inv[INSTRUMENTATION_CONTEXT];
  if (!ids) ids = inv[INSTRUMENTATION_CONTEXT] = { traceId: newId(), spanId: newId() };
  return ids;
}

export function currentContext() {
  const found = currentInvocation();
  if (!found) return EMPTY;
  const { inv, kind } = found;
  const ids = traceIds(inv);
  return {
    traceId: ids.traceId,
    spanId: ids.spanId,
    userId: inv.userId ?? null,
    connectionId: inv.connection?.id ?? null,
    kind,
    // Note: a server-initiated Meteor.callAsync has no `name` on its invocation
    // until meteor/meteor#14478 lands; the event `name` comes from the seam, not here.
    name: kind === 'method' ? (inv.name ?? null) : (inv._name ?? null),
  };
}

// Used by the emission layer: the trace ids of the specific invocation/subscription
// an event is about, so the event's traceId/spanId match currentContext().
export function traceContextFor(invocation) {
  if (!invocation) return { traceId: null, spanId: null };
  return traceIds(invocation);
}
