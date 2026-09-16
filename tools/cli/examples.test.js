// Mock heavy dependencies that examples.js requires at module load
jest.mock('../fs/files', () => ({}));
jest.mock('../utils/http-helpers.js', () => ({}));
jest.mock('../console/console.js', () => ({ Console: { warn: jest.fn() } }));

const { parseGitUrl } = require('./examples.js');

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
