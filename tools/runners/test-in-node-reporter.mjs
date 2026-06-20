// Loaded by Node via --test-reporter, OUTSIDE the isobuild bundle. Zero Meteor deps.
// Bridges node:test events to the driver through globalThis (crosses the bundle boundary).
//
// RACE: this reporter attaches at PROCESS START, but driver.js arrives later via the
// isobuild bundle. Until the driver wires onEvent, buffer events instead of dropping
// them. We reuse (||) the same object the driver will augment — never replace it.
const g = (globalThis.__meteorTestInNode = globalThis.__meteorTestInNode || { pendingEvents: [] });

export default async function* meteorTestInNodeReporter(source) {
  for await (const event of source) {
    if (typeof g.onEvent === 'function') g.onEvent(event);
    else g.pendingEvents.push(event);
    yield ''; // produce an (empty) stdout stream; the driver prints the summary
  }
}
