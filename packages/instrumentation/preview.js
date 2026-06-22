// Bounded, JSON-safe preview of an arbitrary value. Never emits raw application
// objects: it caps depth, key count, string length and array length, breaks
// cycles, and renders non-JSON values (function/symbol/bigint/undefined, Error,
// Date) as safe markers. This is the global-capture serializer AND the final
// safety bound applied to whatever a per-method captureArgs/captureResult returns,
// so a careless override can never blow up a consumer.

const DEFAULTS = { maxDepth: 4, maxKeys: 32, maxStringLength: 200, maxArrayLength: 32 };

const truncate = (str, max) => (str.length > max ? str.slice(0, max) + '…' : str);
// Strings only; a non-string (e.g. a numeric Meteor.Error code) passes through.
const capString = (value, max) => (typeof value === 'string' ? truncate(value, max) : value);

export function previewError(error) {
  const max = DEFAULTS.maxStringLength;
  if (!(error instanceof Error)) {
    return { name: 'Error', message: truncate(String(error), max) };
  }
  // message/reason/error are bounded just like any other captured string, so a
  // huge Meteor.Error('code', hugeReason) can't smuggle an unbounded payload in.
  const out = { name: capString(error.name, max), message: capString(error.message, max) };
  if (error.error !== undefined) out.error = capString(error.error, max);   // Meteor.Error code
  if (error.reason !== undefined) out.reason = capString(error.reason, max); // Meteor.Error reason
  return out;
}

function walk(value, opts, depth, seen) {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string') {
    return truncate(value, opts.maxStringLength);
  }
  if (t === 'number' || t === 'boolean') return value;
  if (t === 'undefined') return '[undefined]';
  if (t === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (t === 'symbol') return value.toString();
  if (t === 'bigint') return `${value}n`;
  if (value instanceof Error) return previewError(value);
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? '[Invalid Date]' : value.toISOString();
  }

  if (depth >= opts.maxDepth) return Array.isArray(value) ? '[Array]' : '[Object]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  let out;
  if (Array.isArray(value)) {
    out = value.slice(0, opts.maxArrayLength).map((v) => walk(v, opts, depth + 1, seen));
    if (value.length > opts.maxArrayLength) out.push(`… +${value.length - opts.maxArrayLength} more`);
  } else {
    out = {};
    const keys = Object.keys(value);
    for (const k of keys.slice(0, opts.maxKeys)) {
      let v;
      try {
        v = value[k]; // an enumerable getter may throw
      } catch (err) {
        out[k] = `[Getter threw: ${err && err.message ? err.message : 'error'}]`;
        continue;
      }
      out[k] = walk(v, opts, depth + 1, seen);
    }
    if (keys.length > opts.maxKeys) out['…'] = `+${keys.length - opts.maxKeys} more keys`;
  }

  seen.delete(value); // allow the same object in sibling branches (DAG, not a cycle)
  return out;
}

export function previewValue(value, options) {
  return walk(value, { ...DEFAULTS, ...(options || {}) }, 0, new WeakSet());
}
