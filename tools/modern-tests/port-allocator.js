// Port allocator for modern-tests.
//
// Each test file (react.test.js, vue.test.js, ...) holds a named "slot"
// and asks this module for its ports. Slots never overlap, and each Jest
// worker gets its own disjoint window — so enabling `maxWorkers > 1` in
// Phase 7 doesn't cause two parallel workers to bind the same port.
//
// Today (`maxWorkers: 1` in jest.config.js) only worker 1 ever runs, so
// this module returns the same ports every time and is behavior-identical
// to the old hardcoded constants. It is wired in now so that Phase 7 is
// a one-line config change rather than a per-file rewrite.
//
// Env vars:
//   JEST_WORKER_ID              — set by Jest (1-indexed), default 1
//   MODERN_TESTS_PORT_BASE      — base port for worker 1, default 30000
//   MODERN_TESTS_WINDOW         — ports per worker, default 300
//
// Usage:
//   import { allocatePort, allocateAuxPort, allocatePortRange } from './port-allocator';
//   const port = allocatePort('react');         // primary app port
//   const rspackPort = allocateAuxPort('react', 1);  // replaces the old 8080
//   const skeletonPorts = allocatePortRange('skeleton', 15);
//
// Adding a new test file? Register its slot in SLOTS below.

const WORKER_ID = Math.max(
  parseInt(process.env.JEST_WORKER_ID || '1', 10) || 1,
  1,
);
const BASE_PORT = parseInt(process.env.MODERN_TESTS_PORT_BASE || '30000', 10);
// A 300-port window per worker: 15 slots × 20 ports each.
const WINDOW = parseInt(process.env.MODERN_TESTS_WINDOW || '300', 10);
const SLOT_SIZE = 20;

const workerBase = BASE_PORT + (WORKER_ID - 1) * WINDOW;

// Slot → offset into the worker window, in SLOT_SIZE units.
// Offsets are stable; additions should go at the end.
const SLOTS = Object.freeze({
  react:        0,
  reactRouter:  1,
  vue:          2,
  svelte:       3,
  solid:        4,
  blaze:        5,
  fullBlaze:    6,
  typescript:   7,
  babel:        8,
  coffeescript: 9,
  monorepo:    10,
  skeleton:    11,
  // 12..14 reserved for future test files.
});

function slotBase(slotName) {
  if (!Object.prototype.hasOwnProperty.call(SLOTS, slotName)) {
    throw new Error(
      `port-allocator: unknown slot "${slotName}". ` +
      `Known: ${Object.keys(SLOTS).join(', ')}`,
    );
  }
  return workerBase + SLOTS[slotName] * SLOT_SIZE;
}

// Primary app port for a slot, plus optional in-slot offset (0..SLOT_SIZE-1).
export function allocatePort(slotName, offset = 0) {
  if (offset < 0 || offset >= SLOT_SIZE) {
    throw new Error(
      `port-allocator: offset must be 0..${SLOT_SIZE - 1}, got ${offset}`,
    );
  }
  return slotBase(slotName) + offset;
}

// Aux port for supporting services (Rspack dev-server 8080,
// bundle-visualizer 8081/8082). Index 0 is reserved for the primary app
// port; use 1..SLOT_SIZE-1 for auxiliaries.
export function allocateAuxPort(slotName, index) {
  if (index < 1 || index >= SLOT_SIZE) {
    throw new Error(
      `port-allocator: aux index must be 1..${SLOT_SIZE - 1}, got ${index}`,
    );
  }
  return slotBase(slotName) + index;
}

// Contiguous range starting at the slot base. Used by skeleton.test.js which
// needs many ports at once.
export function allocatePortRange(slotName, count) {
  if (count < 1 || count > SLOT_SIZE) {
    throw new Error(
      `port-allocator: count must be 1..${SLOT_SIZE}, got ${count}`,
    );
  }
  const base = slotBase(slotName);
  return Array.from({ length: count }, (_, i) => base + i);
}

// Expose for debug logging / deliberate raw access.
export const _debug = Object.freeze({
  WORKER_ID,
  BASE_PORT,
  WINDOW,
  workerBase,
  SLOT_SIZE,
  SLOTS,
});
