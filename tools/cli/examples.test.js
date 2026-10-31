// Mock heavy dependencies that examples.js requires at module load
jest.mock('../fs/files', () => ({}));
jest.mock('../utils/http-helpers.js', () => ({}));
jest.mock('../console/console.js', () => ({ Console: { warn: jest.fn() } }));

const { parseGitUrl, validateExamplesData } = require('./examples.js');

describe('validateExamplesData', () => {
  it('keeps a valid example after a null or non-object entry', () => {
    const warn = jest.fn();
    const valid = {
      slug: 'ok',
      repositoryUrl: 'https://example.invalid/repo',
    };
    expect(validateExamplesData([null, 'bad-string', undefined, valid], { warn })).toEqual([valid]);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('skips entry with missing or non-string slug', () => {
    const warn = jest.fn();
    const entry = { slug: 123, repositoryUrl: 'https://example.com' };
    expect(validateExamplesData([entry], { warn })).toEqual([]);
    expect(warn).toHaveBeenCalledWith('Skipping example entry with missing slug');
  });

  it('skips entry with missing or non-string repositoryUrl', () => {
    const warn = jest.fn();
    const entry = { slug: 'test-slug', repositoryUrl: null };
    expect(validateExamplesData([entry], { warn })).toEqual([]);
    expect(warn).toHaveBeenCalledWith("Skipping example 'test-slug' with missing repositoryUrl");
  });

  it('throws when data is not an array', () => {
    expect(() => validateExamplesData(null)).toThrow('Invalid examples.json format: expected a JSON array.');
    expect(() => validateExamplesData({})).toThrow('Invalid examples.json format: expected a JSON array.');
  });
});

describe('parseGitUrl', () => {
  describe('GitHub URLs', () => {
    it('parses branch-only URL', () => {
      const result = parseGitUrl('https://github.com/meteor/meteor3-vue3/tree/3.4-rspack');
      expect(result).toEqual({
        repoUrl: 'https://github.com/meteor/meteor3-vue3',
        branch: '3.4-rspack',
        dir: null,
      });
    });

    it('parses branch and directory', () => {
      const result = parseGitUrl('https://github.com/meteor/examples/tree/main/parties');
      expect(result).toEqual({
        repoUrl: 'https://github.com/meteor/examples',
        branch: 'main',
        dir: 'parties',
      });
    });

    it('parses branch and nested directory', () => {
      const result = parseGitUrl('https://github.com/owner/repo/tree/develop/src/app/demo');
      expect(result).toEqual({
        repoUrl: 'https://github.com/owner/repo',
        branch: 'develop',
        dir: 'src/app/demo',
      });
    });

    it('strips trailing slashes from dir', () => {
      const result = parseGitUrl('https://github.com/owner/repo/tree/main/dir/');
      expect(result).toEqual({
        repoUrl: 'https://github.com/owner/repo',
        branch: 'main',
        dir: 'dir',
      });
    });

    it('decodes percent-encoded branch names', () => {
      const result = parseGitUrl('https://github.com/owner/repo/tree/feature%2Ftest');
      expect(result).toEqual({
        repoUrl: 'https://github.com/owner/repo',
        branch: 'feature/test',
        dir: null,
      });
    });

    it('works with http (not https)', () => {
      const result = parseGitUrl('http://github.com/owner/repo/tree/main');
      expect(result).toEqual({
        repoUrl: 'http://github.com/owner/repo',
        branch: 'main',
        dir: null,
      });
    });
  });

  describe('GitLab URLs', () => {
    it('parses branch-only URL', () => {
      const result = parseGitUrl('https://gitlab.com/owner/repo/-/tree/main');
      expect(result).toEqual({
        repoUrl: 'https://gitlab.com/owner/repo',
        branch: 'main',
        dir: null,
      });
    });

    it('parses branch and directory', () => {
      const result = parseGitUrl('https://gitlab.com/ns/project/-/tree/develop/src');
      expect(result).toEqual({
        repoUrl: 'https://gitlab.com/ns/project',
        branch: 'develop',
        dir: 'src',
      });
    });
  });

  describe('Bitbucket URLs', () => {
    it('parses branch-only URL', () => {
      const result = parseGitUrl('https://bitbucket.org/owner/repo/src/main');
      expect(result).toEqual({
        repoUrl: 'https://bitbucket.org/owner/repo',
        branch: 'main',
        dir: null,
      });
    });

    it('parses branch and directory', () => {
      const result = parseGitUrl('https://bitbucket.org/owner/repo/src/develop/lib/core');
      expect(result).toEqual({
        repoUrl: 'https://bitbucket.org/owner/repo',
        branch: 'develop',
        dir: 'lib/core',
      });
    });
  });

  describe('plain git URLs (no tree/src segment)', () => {
    it('returns URL unchanged with null branch and dir', () => {
      const result = parseGitUrl('https://github.com/meteor/meteor3-vue3');
      expect(result).toEqual({
        repoUrl: 'https://github.com/meteor/meteor3-vue3',
        branch: null,
        dir: null,
      });
    });

    it('handles SSH-style URLs unchanged', () => {
      const result = parseGitUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({
        repoUrl: 'git@github.com:owner/repo.git',
        branch: null,
        dir: null,
      });
    });
  });

  describe('edge cases', () => {
    it('returns defaults for null input', () => {
      const result = parseGitUrl(null);
      expect(result).toEqual({ repoUrl: null, branch: null, dir: null });
    });

    it('returns defaults for empty string', () => {
      const result = parseGitUrl('');
      expect(result).toEqual({ repoUrl: '', branch: null, dir: null });
    });

    it('returns defaults for non-string input', () => {
      const result = parseGitUrl(42);
      expect(result).toEqual({ repoUrl: 42, branch: null, dir: null });
    });
  });
});
