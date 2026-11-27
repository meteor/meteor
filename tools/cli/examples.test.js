// Mock heavy dependencies that examples.js requires at module load
jest.mock('../fs/files', () => ({}));
jest.mock('../utils/http-helpers.js', () => ({}));
jest.mock('../console/console.js', () => ({ Console: { warn: jest.fn() } }));

describe('validateExamplesData', () => {
  const { validateExamplesData } = require('./examples.js');
  const valid = { slug: 'ok', repositoryUrl: 'https://example.invalid/repo' };

  it('skips null entries and keeps valid examples', () => {
    const warn = jest.fn();
    expect(validateExamplesData([null, valid], { warn })).toEqual([valid]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns for invalid entries and missing required fields', () => {
    const warn = jest.fn();
    const entries = [undefined, [], false, 42, 'invalid', {}, { slug: 'missing-url' }, valid];
    expect(validateExamplesData(entries, { warn })).toEqual([valid]);
    expect(warn).toHaveBeenCalledTimes(7);
  });

  it('rejects non-array inputs', () => {
    expect(() => validateExamplesData(null)).toThrow('Invalid examples.json format: expected a JSON array.');
    expect(() => validateExamplesData({})).toThrow('Invalid examples.json format: expected a JSON array.');
  });
});
