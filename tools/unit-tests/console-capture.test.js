const { EventEmitter } = require('events');
const { withConsoleCapture } = require('../e2e-tests/console-capture');

describe('browser console capture', () => {
  test('captures events from the trigger through the final assertion', async () => {
    const page = new EventEmitter();
    const emit = text => page.emit('console', { text: () => text });
    const result = await withConsoleCapture(page, async messages => {
      emit('client edit applied');
      expect(messages).toEqual(['client edit applied']);
      await new Promise(resolve => setImmediate(resolve));
      emit('[HMR] Updated modules: client/main.jsx');
      expect(messages).toEqual([
        'client edit applied',
        '[HMR] Updated modules: client/main.jsx',
      ]);
      return 'assertions complete';
    });
    expect(result).toBe('assertions complete');
    expect(page.listenerCount('console')).toBe(0);
  });

  test('removes only its own listener when an assertion fails', async () => {
    const page = new EventEmitter();
    const existing = jest.fn();
    page.on('console', existing);
    const failure = new Error('missing HMR update');
    await expect(withConsoleCapture(page, async () => {
      throw failure;
    })).rejects.toBe(failure);
    expect(page.listeners('console')).toEqual([existing]);
  });
});
