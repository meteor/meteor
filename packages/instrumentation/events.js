import { emit } from './emitter.js';
import { traceContextFor } from './context.js';
import { captureArgs, captureResult, capturePublicationArgs, captureClientAddress, eventPrefix, isEnabled } from './policy.js';
import { previewError } from './preview.js';

// Builds the public event from the RAW materials the seam hands over (the live
// invocation/subscription, the name, args, etc.). All policy lives here — context,
// redaction, bounded preview, and the export prefix — so the core seam stays tiny.

function envelope(type) {
  const prefix = eventPrefix();
  return { type, eventName: prefix ? `${prefix}.${type}` : type, ts: Date.now() };
}

function methodPayload(type, raw) {
  const inv = raw.invocation;
  const ids = traceContextFor(inv);
  const event = {
    ...envelope(type),
    traceId: ids.traceId,
    spanId: ids.spanId,
    connectionId: inv?.connection?.id ?? null,
    userId: inv?.userId ?? null,
    name: raw.name, // from the seam — correct on both invocation paths
    argsCount: raw.args ? raw.args.length : 0,
  };
  if (raw.durationMs !== undefined) event.durationMs = raw.durationMs;
  if (raw.handlerMs !== undefined) event.handlerMs = raw.handlerMs;

  const args = captureArgs(raw.name, raw.args);
  if (args !== undefined) event.args = args;
  if (type === 'method.end') {
    const result = captureResult(raw.name, raw.result);
    if (result !== undefined) event.result = result;
  }
  // previewError returns a fresh, bounded plain object (capped strings, no stack,
  // no .details, never the raw Error reference) — safe to hand to listeners.
  if (type === 'method.error') event.error = previewError(raw.error);
  return event;
}

function publicationPayload(type, raw) {
  const sub = raw.subscription;
  const ids = traceContextFor(sub);
  const event = {
    ...envelope(type),
    traceId: ids.traceId,
    spanId: ids.spanId,
    connectionId: sub?.connection?.id ?? null,
    userId: sub?.userId ?? null,
    name: raw.name,
    subscriptionId: sub?._subscriptionId ?? null,
    argsCount: raw.args ? raw.args.length : 0,
  };
  if (raw.durationMs !== undefined) event.durationMs = raw.durationMs;

  const args = capturePublicationArgs(raw.name, raw.args);
  if (args !== undefined) event.args = args;
  if (type === 'publication.error') event.error = previewError(raw.error);
  return event;
}

function connectionPayload(type, raw) {
  const event = { ...envelope(type), connectionId: raw.connectionId };
  // clientAddress is the client IP (PII): only attach it when explicitly opted in,
  // and only when the transport actually gave us a non-empty value.
  if (captureClientAddress() && !!raw.clientAddress) {
    event.clientAddress = raw.clientAddress;
  }
  if (raw.durationMs !== undefined) event.durationMs = raw.durationMs;
  return event;
}

// One event per message written to a socket: the DDP `msg` kind, the collection
// for document messages, and the serialized size. Never the document id, fields
// or values. `bytes` is computed here, so it costs nothing without a listener.
function messagePayload(type, raw) {
  const event = {
    ...envelope(type),
    connectionId: raw.connectionId,
    msg: raw.msg.msg,
    bytes: Buffer.byteLength(raw.stringMsg),
  };
  if (raw.msg.collection !== undefined) event.collection = raw.msg.collection;
  return event;
}

function buildPayload(type, raw) {
  if (type.startsWith('method.')) return methodPayload(type, raw);
  if (type.startsWith('publication.')) return publicationPayload(type, raw);
  if (type === 'ddp.message.out') return messagePayload(type, raw);
  return connectionPayload(type, raw);
}

// Called by the core seam (and by our own connection wiring). The payload is built
// lazily — only when at least one listener is registered for `type`.
export function _emit(type, raw) {
  if (!isEnabled()) return; // global kill-switch, independent of listeners
  emit(type, () => buildPayload(type, raw));
}
