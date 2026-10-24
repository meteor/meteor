/** @jest-environment node */

import { waitForMeteorOutput } from './helpers';

describe('CLI / Output matching', () => {
  const nativeFailure = '\u001b[31m✗\u001b[39m native test\u001b[90m (3ms)\u001b[39m';
  const runtimePass = '\u001b[32m✓\u001b[0m tests/runtime.test.js (1)';
  const options = { timeout: 50, checkInterval: 5 };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test.each([
    ['native string', nativeFailure, '✗ native test'],
    ['native regex', nativeFailure, /^✗ native test \(3ms\)$/],
    ['runtime string', runtimePass, '✓ tests/runtime.test.js (1)'],
    ['runtime regex', runtimePass, /^✓ tests\/runtime\.test\.js \(1\)$/],
  ])('matches colored %s output and preserves the raw line', async (_, line, pattern) => {
    const outputLines = [line];
    const result = waitForMeteorOutput(outputLines, pattern, options);
    jest.advanceTimersByTime(60);

    await expect(result).resolves.toBe(line);
    expect(outputLines).toEqual([line]);
  });

  test.each(['✗ native test', /^✗ native test/])(
    'rejects negated matches in colored output: %s',
    async pattern => {
      const result = waitForMeteorOutput([nativeFailure], pattern, {
        ...options,
        negate: true,
      });
      jest.advanceTimersByTime(60);

      await expect(result).rejects.toThrow(`Offending line(s):\n${nativeFailure}`);
    },
  );

  test('waits for new colored output after startIndex', async () => {
    const outputLines = ['✓ tests/runtime.test.js (1)'];
    const result = waitForMeteorOutput(outputLines, '✓ tests/runtime.test.js (1)', {
      ...options,
      startIndex: 1,
    });
    outputLines.push(runtimePass);
    jest.advanceTimersByTime(60);

    await expect(result).resolves.toBe(runtimePass);
  });
});
