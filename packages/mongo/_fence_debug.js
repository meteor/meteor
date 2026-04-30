// Diagnostic instrumentation for the fence ↔ multiplexer ↔ observe-driver
// race investigation. Off by default — enable with:
//
//   METEOR_DEBUG_OBSERVE_FENCE=1
//
// Each event is emitted as one JSON line on stderr, prefixed with
// `[fence-debug]` so test logs can be grepped after the fact. Events carry
// a monotonic timestamp (`t`, ms since process start) and a strictly
// increasing sequence number (`seq`) so ordering is unambiguous even when
// timestamps are tied.
//
// Log fields used downstream:
//   - `mxId`   : per-multiplexer correlation id (stable for one publication)
//   - `cb`     : 'added' | 'changed' | 'removed' (and `*Before` for ordered)
//   - `docId`  : the doc the callback was for (best-effort string form)
//   - `chain`  : how many handle delivery chains were snapshotted by onFlush
//   - `phase`  : 'enter' | 'caughtUp' | 'flushed' | 'snapshot' | 'committed'
//
// To correlate driver activity with multiplexer activity, drivers emit
// their fence callback's lifecycle around the multiplexer's onFlush events.

const enabled = !!process.env.METEOR_DEBUG_OBSERVE_FENCE;

let seq = 0;
const startNs = process.hrtime.bigint();

function nowMs() {
  return Number(process.hrtime.bigint() - startNs) / 1e6;
}

function safeStringify(v) {
  if (v == null) return v;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return v;
  }
  try {
    if (typeof v.toString === 'function') {
      const s = v.toString();
      if (s !== '[object Object]') return s;
    }
  } catch {
    // fall through
  }
  try {
    return JSON.stringify(v);
  } catch {
    return '<unserializable>';
  }
}

export const FENCE_DEBUG_ENABLED = enabled;

export function fenceLog(event, data = {}) {
  if (!enabled) return;
  const sanitized = {};
  for (const [k, v] of Object.entries(data)) {
    sanitized[k] = k === 'docId' ? safeStringify(v) : v;
  }
  const line = JSON.stringify({
    seq: ++seq,
    t: Number(nowMs().toFixed(3)),
    event,
    ...sanitized,
  });
  process.stderr.write(`[fence-debug] ${line}\n`);
}
