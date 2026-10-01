// Unit tests for splitQuotedArgs — the SERVER_NODE_OPTIONS parser in run-app.js

// run-app.js pulls in most of the Meteor tool-chain (isobuild, catalog, etc.).
// None of those are needed for splitQuotedArgs, so we stub them out to keep
// the test fast and dependency-free.
jest.mock('../fs/files', () => ({}));
jest.mock('../fs/watch', () => ({}));
jest.mock('../isobuild/bundler.js', () => ({}));
jest.mock('../utils/buildmessage.js', () => ({}));
jest.mock('./run-log.js', () => ({}));
jest.mock('../meteor-services/stats.js', () => ({}));
jest.mock('../console/console.js', () => ({ Console: {} }));
jest.mock('../packaging/catalog/catalog.js', () => ({}));
jest.mock('../tool-env/profile', () => ({ Profile: {} }));
jest.mock('../packaging/release.js', () => ({}));
jest.mock('../cordova/index.js', () => ({ pluginVersionsFromStarManifest: () => {} }));
jest.mock('../fs/safe-watcher', () => ({ closeAllWatchers: () => {} }));
jest.mock('../tool-env/isopackets.js', () => ({ loadIsopackage: () => {} }));
jest.mock('../utils/eachline', () => ({ eachline: () => {} }));

const {
  AppRunner,
  reusableBuildersForBundle,
  splitQuotedArgs,
} = require('./run-app.js');

// --- Tests ---

describe('splitQuotedArgs', () => {
  describe('unquoted values', () => {
    test('empty string returns empty array', () => {
      expect(splitQuotedArgs('')).toEqual([]);
    });

    test('simple flags split on whitespace', () => {
      expect(splitQuotedArgs('--inspect --max-old-space-size=4096')).toEqual([
        '--inspect',
        '--max-old-space-size=4096',
      ]);
    });

    test('multiple spaces between args', () => {
      expect(splitQuotedArgs('  --a   --b  ')).toEqual(['--a', '--b']);
    });
  });

  describe('quoted values', () => {
    test('double-quoted value', () => {
      expect(splitQuotedArgs('--test-name-pattern="validation"')).toEqual([
        '--test-name-pattern=validation',
      ]);
    });

    test('single-quoted value', () => {
      expect(splitQuotedArgs("--test-name-pattern='validation'")).toEqual([
        '--test-name-pattern=validation',
      ]);
    });

    test('double-quoted value with spaces', () => {
      expect(splitQuotedArgs('--test-name-pattern="my pattern"')).toEqual([
        '--test-name-pattern=my pattern',
      ]);
    });

    test('mixed quoted and unquoted args', () => {
      expect(splitQuotedArgs('--inspect --test-reporter="my reporter" --once')).toEqual([
        '--inspect',
        '--test-reporter=my reporter',
        '--once',
      ]);
    });

    test('escaped quote inside double quotes', () => {
      expect(splitQuotedArgs('--pattern="say \\"hello\\""')).toEqual([
        '--pattern=say "hello"',
      ]);
    });

    test('single quotes preserve double quotes literally', () => {
      expect(splitQuotedArgs("--pattern='say \"hello\"'")).toEqual([
        '--pattern=say "hello"',
      ]);
    });

    test('unterminated double quote throws', () => {
      expect(() => splitQuotedArgs('--flag="unterminated')).toThrow(
        /Unterminated quote/
      );
    });

    test('unterminated single quote throws', () => {
      expect(() => splitQuotedArgs("--flag='unterminated")).toThrow(
        /Unterminated quote/
      );
    });
  });

  describe('edge cases', () => {
    test('empty double-quoted arg is preserved', () => {
      expect(splitQuotedArgs('--foo ""')).toEqual(['--foo', '']);
    });

    test('empty single-quoted arg is preserved', () => {
      expect(splitQuotedArgs("--foo ''")).toEqual(['--foo', '']);
    });

    test('backslash-escaped space outside quotes', () => {
      expect(splitQuotedArgs('--foo hello\\ world')).toEqual([
        '--foo',
        'hello world',
      ]);
    });

    test('Windows backslash paths are preserved', () => {
      expect(splitQuotedArgs('--require=C:\\temp\\my-file.js')).toEqual([
        '--require=C:\\temp\\my-file.js',
      ]);
    });

    test('Windows path inside double quotes', () => {
      expect(splitQuotedArgs('"C:\\Program Files\\node\\node.exe"')).toEqual([
        'C:\\Program Files\\node\\node.exe',
      ]);
    });

    test('concatenated double-quoted segments', () => {
      expect(splitQuotedArgs('"abc""def"')).toEqual(['abcdef']);
    });

    test('concatenated single-quoted segments', () => {
      expect(splitQuotedArgs("'abc''def'")).toEqual(['abcdef']);
    });
  });

  describe('real-world examples', () => {
    test('node:test coverage + reporter', () => {
      expect(splitQuotedArgs(
        '--experimental-test-coverage --test-reporter=spec'
      )).toEqual([
        '--experimental-test-coverage',
        '--test-reporter=spec',
      ]);
    });

    test('multi-reporter setup', () => {
      expect(splitQuotedArgs(
        '--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=./results.xml'
      )).toEqual([
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=junit',
        '--test-reporter-destination=./results.xml',
      ]);
    });
  });
});

describe('reusableBuildersForBundle', () => {
  test('keeps complete builders while bundle root exists', () => {
    const builders = {
      star: { outputPath: '/app/build' },
      'web.browser': { outputPath: '/app/build/programs/web.browser' },
    };

    expect(reusableBuildersForBundle(builders, true)).toBe(builders);
  });

  test('discards target builders when archive builder is missing', () => {
    const builders = {
      'web.browser': { outputPath: '/app/build/programs/web.browser' },
    };

    expect(reusableBuildersForBundle(builders, true)).toEqual({});
  });

  test('discards all builders when bundle root disappeared', () => {
    const builders = {
      star: { outputPath: '/app/build' },
      'web.browser': { outputPath: '/app/build/programs/web.browser' },
    };

    expect(reusableBuildersForBundle(builders, false)).toEqual({});
  });
});

describe('AppRunner test runner generations', () => {
  test('starts a fresh run after a watched generation changes', async () => {
    const runner = Object.create(AppRunner.prototype);
    runner.testRunnerSession = {
      beforeAppRun: jest.fn().mockResolvedValue(undefined),
    };
    runner.updateTestRunnerMetadata = jest.fn();
    runner._runOnce = jest.fn()
      .mockResolvedValueOnce({ outcome: 'changed' })
      .mockResolvedValueOnce({ outcome: 'stopped' });
    runner.onRunEnd = jest.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    runner.exitPromise = null;

    await runner._runApp();

    expect(runner.testRunnerSession.beforeAppRun).toHaveBeenCalledTimes(2);
    expect(runner._runOnce).toHaveBeenCalledTimes(2);
  });
});
