// Test slot helpers.
//
// A "slot" is the set of resources (ports, tmp roots, mongo db prefix) that
// belong to a single test worker. Workers are indexed 0..N-1 and derive
// non-overlapping port ranges so tests can run in parallel without
// colliding on the network or the filesystem.
//
// Phase 1: this module is only wired into a handful of call sites (see
// plano_testes_paralelos.md). Callers that don't opt in keep the legacy
// defaults (worker 0, port base 3000), so nothing observable changes
// until the worker pool in Phase 5 starts setting the env vars.
//
// Env vars read here:
//   METEOR_TEST_WORKER_ID    — integer, default 0
//   METEOR_TEST_PORT_BASE    — integer base port for the worker's range,
//                              default 3000 (the historic meteor run port)
//   METEOR_TEST_PORTS_PER_WORKER — size of the per-worker range, default 100
//   METEOR_TEST_TMP_ROOT     — tmp root for sandbox.mkdtemp(); default is
//                              the OS tmp dir (what files.mkdtemp already uses)

const DEFAULT_PORT_BASE = 3000;
const DEFAULT_PORTS_PER_WORKER = 100;

// Offsets reserved inside a worker's port range. Keep them stable — tests
// and helpers index into this map by name, not by raw number.
const PORT_OFFSETS = Object.freeze({
  // The main Meteor app port (what `-p` passes to `meteor run`). Mongo is
  // started at app + 1 by run-all.js, so the next offset starts at 2.
  app: 0,
  // Fake mongod control channel (see tools/tests/fake-mongod/).
  fakeMongoControl: 2,
  // Proxy used by a few self-tests that need a secondary HTTP listener.
  auxProxy: 3,
  // Free slots tests can claim for ad-hoc listeners. See allocatePort(name).
  adhocStart: 10,
});

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

export function getWorkerId() {
  return parseIntEnv('METEOR_TEST_WORKER_ID', 0);
}

export function getPortsPerWorker() {
  return parseIntEnv('METEOR_TEST_PORTS_PER_WORKER', DEFAULT_PORTS_PER_WORKER);
}

// Returns the first port in the current worker's range.
export function getPortBase() {
  const explicit = process.env.METEOR_TEST_PORT_BASE;
  if (explicit) {
    const parsed = parseInt(explicit, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  // No explicit base: keep the historic default (3000) for worker 0 so
  // single-worker runs are indistinguishable from pre-parallel behaviour.
  return DEFAULT_PORT_BASE + getWorkerId() * getPortsPerWorker();
}

// Allocate a port from the current worker's range.
//
// Callers pass a symbolic name (one of PORT_OFFSETS keys) or an integer
// offset. Named offsets are the preferred form — they stay stable even if
// the layout of the range shifts.
export function allocatePort(nameOrOffset) {
  const base = getPortBase();
  if (typeof nameOrOffset === 'number') {
    return base + nameOrOffset;
  }
  if (PORT_OFFSETS.hasOwnProperty(nameOrOffset)) {
    return base + PORT_OFFSETS[nameOrOffset];
  }
  throw new Error(
    `allocatePort: unknown offset name "${nameOrOffset}". ` +
    `Known names: ${Object.keys(PORT_OFFSETS).join(', ')}`,
  );
}

// Per-call ad-hoc port allocator. Each call returns a distinct port from
// the adhoc range (offsets 10..ports_per_worker-1). The counter is local
// to the current Node.js process, which matches the worker model: one
// worker = one process = one counter.
let adhocCursor = 0;
export function allocateAdhocPort() {
  const base = getPortBase();
  const perWorker = getPortsPerWorker();
  const adhocSize = perWorker - PORT_OFFSETS.adhocStart;
  if (adhocSize <= 0) {
    throw new Error(
      'allocateAdhocPort: port range too small; increase METEOR_TEST_PORTS_PER_WORKER',
    );
  }
  const offset = PORT_OFFSETS.adhocStart + (adhocCursor % adhocSize);
  adhocCursor += 1;
  return base + offset;
}

// Where test sandboxes should drop their tmp dirs. A null return means
// "use the OS default" — callers should forward this to files.mkdtemp,
// which already falls back to os.tmpdir() when given a relative path.
export function getTmpRoot() {
  return process.env.METEOR_TEST_TMP_ROOT || null;
}

// Prefix used when building mongo dbPath directories so two workers on
// the same host don't step on each other's db dirs or get matched by
// findMongoPids.
export function getMongoDbPrefix() {
  return process.env.METEOR_TEST_MONGO_DB_PREFIX
    || `meteor-test-w${getWorkerId()}-`;
}

export const PORT_LAYOUT = PORT_OFFSETS;
