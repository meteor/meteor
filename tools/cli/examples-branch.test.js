const mockRequest = jest.fn();
const mockExists = jest.fn();
const mockReadFile = jest.fn();

jest.mock('../fs/files', () => ({
  pathJoin: (...parts) => parts.join('/'),
  exists: (...args) => mockExists(...args),
  readFile: (...args) => mockReadFile(...args),
  writeFile: jest.fn(),
}));
jest.mock('../utils/http-helpers.js', () => ({
  request: (...args) => mockRequest(...args),
}));
jest.mock('../console/console.js', () => ({ Console: { warn: jest.fn() } }));
jest.mock('../packaging/tropohouse.js', () => ({
  default: { root: '/tmp/meteor' },
}));
jest.mock('./git-clone.js', () => ({}));

const originalExamplesBranch = process.env.METEOR_EXAMPLES_BRANCH;

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  if (originalExamplesBranch === undefined) {
    delete process.env.METEOR_EXAMPLES_BRANCH;
  } else {
    process.env.METEOR_EXAMPLES_BRANCH = originalExamplesBranch;
  }
});

test('does not use a cached catalog from another examples branch', async () => {
  process.env.METEOR_EXAMPLES_BRANCH = 'codex/typescript-7-examples';
  mockRequest.mockRejectedValue(new Error('offline'));
  mockExists.mockReturnValue(true);
  mockReadFile.mockReturnValue(JSON.stringify({
    branch: 'main',
    examples: [{ slug: 'tic-tac-toe', repositoryUrl: 'https://example.test' }],
  }));

  const { getExamples } = require('./examples.js');

  await expect(getExamples()).rejects.toThrow('offline');
});
