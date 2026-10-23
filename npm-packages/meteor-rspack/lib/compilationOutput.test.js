const { createOutputTracker } = require('./compilationOutput.js');

const stats = (assets, { hash = 'compilation-hash', hasErrors = false } = {}) => ({
  hash,
  hasErrors: () => hasErrors,
  toJson: () => ({ assets }),
});
const asset = (name, emitted = false, related = []) => ({
  name, emitted, related,
});

describe('server output tracking', () => {
  test('ignores compilation-only changes and asset ordering', () => {
    const track = createOutputTracker();
    const first = track(stats([
      asset('server.js', true),
      asset('chunk.js', true),
    ]));

    expect(track(stats([
      asset('chunk.js'),
      asset('server.js'),
    ], { hash: 'different-compilation-hash' }))).toBe(first);

    expect(track(stats([
      asset('server.js'),
      asset('chunk.js', true),
    ]))).not.toBe(first);
  });

  test('detects source-map-only changes and asset removals', () => {
    const track = createOutputTracker();
    const first = track(stats([
      asset('server.js', false, [asset('server.js.map')]),
      asset('chunk.js'),
    ]));
    const updatedMap = track(stats([
      asset('server.js', false, [asset('server.js.map', true)]),
      asset('chunk.js'),
    ]));
    expect(updatedMap).not.toBe(first);

    const removedChunk = track(stats([
      asset('server.js', false, [asset('server.js.map')]),
    ]));
    expect(removedChunk).not.toBe(updatedMap);
    expect(track(stats([
      asset('server.js', false, [asset('server.js.map')]),
    ]))).toBe(removedChunk);
  });

  test('keeps output changes visible when a failed build recovers without writing again', () => {
    const track = createOutputTracker();
    const lastSuccessful = track(stats([asset('server.js', true)]));
    const failed = track(stats([asset('server.js', true)], { hasErrors: true }));
    // Meteor ignores failed compilations; recovery must still differ from the
    // last successful version even when Rspack has already written the output.
    const recovered = track(stats([asset('server.js')]));
    expect(recovered).toBe(failed);
    expect(recovered).not.toBe(lastSuccessful);
  });
});
